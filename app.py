import eventlet
eventlet.monkey_patch()

"""
╔══════════════════════════════════════════════════════════════╗
║          WAYCHAT SERVER ENGINE 2026                          ║
║          Version: 7.0.0 — PREMIUM EDITION                   ║
║  Groups · Cache · Real-time · SQLite WAL · Fixed Auth        ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import uuid
import mimetypes
import json
import time
import hashlib
import base64
import struct
import hmac as hmac_module
import random
import eventlet
import eventlet.queue
from functools import wraps
from collections import defaultdict
from datetime import datetime, timedelta

from flask import (
    Flask, render_template, request, redirect,
    url_for, flash, jsonify, session, make_response
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user,
    login_required, current_user
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import or_, func, text
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

# Криптография для VAPID Web Push
try:
    import jwt as pyjwt
    import requests as req_lib
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.hashes import SHA256
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.asymmetric.ec import ECDH
    PUSH_AVAILABLE = True
except ImportError as _e:
    PUSH_AVAILABLE = False
    print(f'⚠️  Web Push недоступен (установите: pip install cryptography PyJWT requests): {_e}')

# ══════════════════════════════════════════════════════════
#  ПУТИ И ПАПКИ
# ══════════════════════════════════════════════════════════
BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER   = os.path.join(BASE_DIR, 'static', 'uploads')
AVATARS_FOLDER  = os.path.join(UPLOAD_FOLDER, 'avatars')
MESSAGES_FOLDER = os.path.join(UPLOAD_FOLDER, 'messages')
MOMENTS_FOLDER  = os.path.join(UPLOAD_FOLDER, 'moments')
GROUP_AVA_FOLDER = os.path.join(UPLOAD_FOLDER, 'groups')

for _folder in [AVATARS_FOLDER, MESSAGES_FOLDER, MOMENTS_FOLDER, GROUP_AVA_FOLDER]:
    try:
        os.makedirs(_folder, exist_ok=True)
    except Exception:
        pass

# ══════════════════════════════════════════════════════════
#  TTL КЭШИ
# ══════════════════════════════════════════════════════════
class TTLCache:
    def __init__(self, maxsize=512, ttl=30.0):
        self._store   = {}
        self._times   = {}
        self._maxsize = maxsize
        self._ttl     = ttl

    def get(self, key):
        if key in self._store:
            if time.monotonic() - self._times[key] < self._ttl:
                return self._store[key]
            self._evict(key)
        return None

    def set(self, key, value):
        if len(self._store) >= self._maxsize:
            oldest = min(self._times, key=self._times.get)
            self._evict(oldest)
        self._store[key] = value
        self._times[key] = time.monotonic()

    def delete(self, key):
        self._store.pop(key, None)
        self._times.pop(key, None)

    def _evict(self, key):
        self._store.pop(key, None)
        self._times.pop(key, None)

    def invalidate_prefix(self, prefix):
        keys = [k for k in list(self._store) if str(k).startswith(str(prefix))]
        for k in keys:
            self._evict(k)


_user_cache    = TTLCache(maxsize=1000, ttl=60.0)
_chat_cache    = TTLCache(maxsize=2000, ttl=10.0)
_online_cache  = TTLCache(maxsize=2000, ttl=5.0)
_partner_cache = TTLCache(maxsize=1000, ttl=30.0)
_moments_cache = TTLCache(maxsize=1,    ttl=30.0)

_rate_limits    = defaultdict(lambda: defaultdict(list))
_status_throttle = {}

# ══════════════════════════════════════════════════════════
#  VAPID — WEB PUSH (iOS Safari 16.4+)
# ══════════════════════════════════════════════════════════
def _vapid_init():
    """Загружаем или генерируем VAPID ключи при старте."""
    if not PUSH_AVAILABLE:
        return None, None

    key_file = os.path.join(BASE_DIR, 'instance', 'vapid_keys.json')
    os.makedirs(os.path.dirname(key_file), exist_ok=True)

    if os.path.exists(key_file):
        with open(key_file) as f:
            keys = json.load(f)
        return keys['public'], keys['private']

    key  = ec.generate_private_key(ec.SECP256R1(), default_backend())
    pub  = key.public_key()
    pub_bytes  = pub.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    priv_value = key.private_numbers().private_value.to_bytes(32, 'big')

    pub_b64  = base64.urlsafe_b64encode(pub_bytes).rstrip(b'=').decode()
    priv_b64 = base64.urlsafe_b64encode(priv_value).rstrip(b'=').decode()

    with open(key_file, 'w') as f:
        json.dump({'public': pub_b64, 'private': priv_b64}, f)

    print(f'\n🔑 VAPID public key: {pub_b64}\n')
    return pub_b64, priv_b64

_VAPID_PUBLIC  = None
_VAPID_PRIVATE = None

def _get_vapid_keys():
    global _VAPID_PUBLIC, _VAPID_PRIVATE
    if _VAPID_PUBLIC is None:
        try:
            _VAPID_PUBLIC, _VAPID_PRIVATE = _vapid_init()
        except Exception as e:
            print(f'VAPID init error: {e}')
    return _VAPID_PUBLIC, _VAPID_PRIVATE


def _send_web_push(subscription_info, payload_dict):
    """Отправляем Web Push через VAPID (RFC 8291)."""
    if not PUSH_AVAILABLE:
        return False

    pub_b64, priv_b64 = _get_vapid_keys()
    if not pub_b64:
        return False

    endpoint = subscription_info.get('endpoint', '')
    p256dh   = subscription_info.get('p256dh', '')
    auth     = subscription_info.get('auth', '')
    if not endpoint or not p256dh or not auth:
        return False

    try:
        from urllib.parse import urlparse
        parsed   = urlparse(endpoint)
        audience = f'{parsed.scheme}://{parsed.netloc}'

        now    = int(time.time())
        claims = {'aud': audience, 'exp': now + 43200, 'sub': 'mailto:admin@waychat.app'}

        priv_bytes = base64.urlsafe_b64decode(priv_b64 + '==')
        priv_int   = int.from_bytes(priv_bytes, 'big')
        priv_key   = ec.derive_private_key(priv_int, ec.SECP256R1(), default_backend())
        pem        = priv_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
        token      = pyjwt.encode(claims, pem, algorithm='ES256')

        payload_bytes = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')

        _pad = lambda s: s + '==' [:(4 - len(s) % 4) % 4]
        sub_pub_bytes = base64.urlsafe_b64decode(_pad(p256dh))
        auth_bytes    = base64.urlsafe_b64decode(_pad(auth))

        eph_key       = ec.generate_private_key(ec.SECP256R1(), default_backend())
        eph_pub       = eph_key.public_key()
        eph_pub_bytes = eph_pub.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

        sub_pub_key   = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sub_pub_bytes)
        shared_secret = eph_key.exchange(ECDH(), sub_pub_key)

        salt = os.urandom(16)

        prk_info = b'WebPush: info\x00' + sub_pub_bytes + eph_pub_bytes
        prk = HKDF(algorithm=SHA256(), length=32, salt=auth_bytes,
                   info=prk_info, backend=default_backend()).derive(shared_secret)

        cek   = HKDF(algorithm=SHA256(), length=16, salt=salt,
                     info=b'Content-Encoding: aes128gcm\x00', backend=default_backend()).derive(prk)
        nonce = HKDF(algorithm=SHA256(), length=12, salt=salt,
                     info=b'Content-Encoding: nonce\x00', backend=default_backend()).derive(prk)

        ciphertext  = AESGCM(cek).encrypt(nonce, payload_bytes + b'\x02', None)
        record_size = len(ciphertext) + 16
        body        = salt + struct.pack('>I', record_size) + struct.pack('B', len(eph_pub_bytes)) + eph_pub_bytes + ciphertext

        headers = {
            'Authorization':    f'vapid t={token},k={pub_b64}',
            'Content-Type':     'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL':              '86400',
        }
        resp = req_lib.post(endpoint, data=body, headers=headers, timeout=10)
        return resp.status_code in (200, 201, 202)

    except Exception as e:
        app.logger.error(f'Web push error: {e}')
        return False


def send_push_to_user(user_id, title, body, chat_id=None, icon=None):
    """Отправляем push всем подпискам пользователя."""
    subs = PushSubscription.query.filter_by(user_id=user_id).all()
    if not subs:
        return

    payload = {
        'title':   title,
        'body':    body,
        'icon':    icon or '/static/img/icon-192.png',
        'badge':   '/static/img/badge-96.png',
        'tag':     f'msg-{chat_id or user_id}',
        'chat_id': chat_id,
        'url':     '/',
    }

    dead = []
    for sub in subs:
        try:
            info = {
                'endpoint': sub.endpoint,
                'p256dh':   sub.p256dh,
                'auth':     sub.auth,
            }
            ok = _send_web_push(info, payload)
            if not ok:
                dead.append(sub.id)
        except Exception as e:
            app.logger.error(f'Push send error uid={user_id}: {e}')
            dead.append(sub.id)

    # Удаляем мёртвые подписки
    if dead:
        PushSubscription.query.filter(PushSubscription.id.in_(dead)).delete(synchronize_session=False)
        db.session.commit()

# ══════════════════════════════════════════════════════════
#  ПРИЛОЖЕНИЕ
# ══════════════════════════════════════════════════════════
app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'),
            static_url_path='/static')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

app.config.update(
    SQLALCHEMY_DATABASE_URI        = os.environ.get('DATABASE_URL', '').replace('postgres://', 'postgresql+psycopg://', 1).replace('postgresql://', 'postgresql+psycopg://', 1),
    SQLALCHEMY_TRACK_MODIFICATIONS = False,
    SQLALCHEMY_ENGINE_OPTIONS      = {
        'pool_pre_ping': True,
        'pool_recycle':  300,
        'pool_size':     5,
        'max_overflow':  10,
    },
    SECRET_KEY               = os.environ.get('SECRET_KEY', 'waychat-2026-ultra-secret-key-change-me'),
    MAX_CONTENT_LENGTH       = 100 * 1024 * 1024,
    SESSION_COOKIE_SAMESITE  = 'Lax',
    SESSION_COOKIE_SECURE    = False,
    SESSION_COOKIE_HTTPONLY  = True,
    REMEMBER_COOKIE_SAMESITE = 'Lax',
    REMEMBER_COOKIE_SECURE   = False,
    REMEMBER_COOKIE_DURATION = timedelta(days=30),
    SESSION_PROTECTION       = None,
    JSON_SORT_KEYS           = False,
)

CORS(app, supports_credentials=True, origins=['*'])

def upload_to_cloudinary(file_obj, folder='waychat'):
    """Загружает файл в Cloudinary через прямой HTTP запрос без SDK."""
    import hashlib, time as _time, urllib.request, urllib.parse
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    api_key    = os.environ.get('CLOUDINARY_API_KEY', '')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET', '')
    if not all([cloud_name, api_key, api_secret]):
        return None
    try:
        timestamp = str(int(_time.time()))
        params_to_sign = f'folder={folder}&timestamp={timestamp}'
        signature = hashlib.sha1(f'{params_to_sign}{api_secret}'.encode()).hexdigest()
        
        import cloudinary, cloudinary.uploader
        cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)
        result = cloudinary.uploader.upload(
            file_obj,
            folder=folder,
            resource_type='auto',
            api_key=api_key,
            timestamp=timestamp,
            signature=signature,
        )
        return result.get('secure_url')
    except Exception as e:
        app.logger.error(f'Cloudinary upload error: {e}')
        return None


@app.teardown_appcontext
def shutdown_session(exception=None):
    if exception:
        db.session.rollback()
    db.session.remove()


db = SQLAlchemy(app)

login_manager = LoginManager(app)
login_manager.login_view = 'login'

socketio = SocketIO(
    app,
    async_mode          = 'eventlet',
    cors_allowed_origins = '*',
    manage_session      = True,
    path                = '/socket.io',
    ping_timeout        = 20,
    ping_interval       = 10,
    max_http_buffer_size = 10 * 1024 * 1024,
    logger              = False,
    engineio_logger     = False,
)

# ══════════════════════════════════════════════════════════
#  МОДЕЛИ
# ══════════════════════════════════════════════════════════
class User(UserMixin, db.Model):
    __tablename__ = 'user'
    id            = db.Column(db.Integer,      primary_key=True)
    phone         = db.Column(db.String(20),   unique=True, nullable=False, index=True)
    username      = db.Column(db.String(80),   unique=True, nullable=False, index=True)
    name          = db.Column(db.String(120),  nullable=False)
    bio           = db.Column(db.Text,         default='')
    password_hash = db.Column(db.String(256),  nullable=True)
    avatar        = db.Column(db.String(300),  default='/static/default_avatar.png')
    is_online     = db.Column(db.Boolean,      default=False, index=True)
    last_seen     = db.Column(db.DateTime,     default=datetime.utcnow)
    created_at    = db.Column(db.DateTime,     default=datetime.utcnow)
    is_blocked    = db.Column(db.Boolean,      default=False)

    @property
    def online_status(self):
        cached = _online_cache.get(self.id)
        if cached is not None:
            return cached
        status = self.is_online or (
            self.last_seen is not None and
            datetime.utcnow() - self.last_seen < timedelta(minutes=5)
        )
        _online_cache.set(self.id, status)
        return status

    def invalidate_cache(self):
        _user_cache.delete(self.id)
        _online_cache.delete(self.id)
        _chat_cache.invalidate_prefix(str(self.id))


class Chat(db.Model):
    __tablename__ = 'chat'
    id         = db.Column(db.Integer,     primary_key=True)
    room_key   = db.Column(db.String(100), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime,    default=datetime.utcnow)


class Message(db.Model):
    __tablename__ = 'message'
    id          = db.Column(db.Integer,     primary_key=True)
    chat_id     = db.Column(db.Integer,     db.ForeignKey('chat.id'), nullable=False, index=True)
    sender_id   = db.Column(db.Integer,     db.ForeignKey('user.id'), nullable=False)
    sender_name = db.Column(db.String(120), default='')
    type        = db.Column(db.String(10),  default='text')
    content     = db.Column(db.Text)
    file_url    = db.Column(db.String(300))
    is_read     = db.Column(db.Boolean,     default=False, index=True)
    is_deleted  = db.Column(db.Boolean,     default=False, index=True)
    timestamp   = db.Column(db.DateTime,    default=datetime.utcnow, index=True)

    __table_args__ = (
        db.Index('ix_msg_chat_time',   'chat_id', 'timestamp'),
        db.Index('ix_msg_chat_unread', 'chat_id', 'is_read', 'sender_id'),
    )

    def to_dict(self):
        return {
            'id':            self.id,
            'chat_id':       self.chat_id,
            'sender_id':     self.sender_id,
            'sender_name':   self.sender_name or '',
            'type':          self.type,
            'type_msg':      self.type,
            'content':       self.content,
            'file_url':      self.file_url,
            'is_read':       self.is_read,
            'timestamp':     to_moscow_str(self.timestamp),
            'raw_timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else '',
        }


class MessageReaction(db.Model):
    __tablename__ = 'message_reaction'
    id      = db.Column(db.Integer,    primary_key=True)
    msg_id  = db.Column(db.Integer,    db.ForeignKey('message.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer,    db.ForeignKey('user.id'),    nullable=False)
    emoji   = db.Column(db.String(10), nullable=False)
    __table_args__ = (db.UniqueConstraint('msg_id', 'user_id', 'emoji', name='uq_reaction'),)


class Group(db.Model):
    __tablename__ = 'group'
    id         = db.Column(db.Integer,     primary_key=True)
    name       = db.Column(db.String(64),  nullable=False)
    avatar     = db.Column(db.String(300), default='/static/default_avatar.png')
    creator_id = db.Column(db.Integer,     db.ForeignKey('user.id'), nullable=False)
    chat_id    = db.Column(db.Integer,     db.ForeignKey('chat.id'), nullable=True)
    created_at = db.Column(db.DateTime,    default=datetime.utcnow)


class GroupMember(db.Model):
    __tablename__ = 'group_member'
    id        = db.Column(db.Integer, primary_key=True)
    group_id  = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False, index=True)
    user_id   = db.Column(db.Integer, db.ForeignKey('user.id'),  nullable=False)
    is_admin  = db.Column(db.Boolean, default=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('group_id', 'user_id', name='uq_group_member'),)


class MomentView(db.Model):
    __tablename__ = 'moment_view'
    id         = db.Column(db.Integer, primary_key=True)
    moment_id  = db.Column(db.Integer, db.ForeignKey('moment.id'), nullable=False, index=True)
    viewer_id  = db.Column(db.Integer, db.ForeignKey('user.id'),   nullable=False)
    viewed_at  = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('moment_id','viewer_id'),)


class Moment(db.Model):
    __tablename__ = 'moment'
    id         = db.Column(db.Integer,     primary_key=True)
    user_id    = db.Column(db.Integer,     db.ForeignKey('user.id'), nullable=False, index=True)
    media_url  = db.Column(db.String(300))
    text       = db.Column(db.Text)
    geo_name   = db.Column(db.String(200), nullable=True)
    geo_lat    = db.Column(db.String(20),  nullable=True)
    geo_lng    = db.Column(db.String(20),  nullable=True)
    timestamp  = db.Column(db.DateTime,    default=datetime.utcnow, index=True)
    expires_at = db.Column(db.DateTime,    index=True)


class BlockedUser(db.Model):
    __tablename__ = 'blocked_user'
    id         = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('blocker_id', 'blocked_id', name='uq_block'),)


class PushSubscription(db.Model):
    __tablename__ = 'push_subscription'
    id         = db.Column(db.Integer,     primary_key=True)
    user_id    = db.Column(db.Integer,     db.ForeignKey('user.id'), nullable=False, index=True)
    endpoint   = db.Column(db.Text,        nullable=False)
    p256dh     = db.Column(db.String(200), nullable=False)
    auth       = db.Column(db.String(50),  nullable=False)
    created_at = db.Column(db.DateTime,    default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'endpoint', name='uq_push_sub'),)


@login_manager.user_loader
def load_user(uid):
    uid_int = int(uid)
    cached = _user_cache.get(uid_int)
    if cached is not None:
        return cached
    user = db.session.get(User, uid_int)
    if user:
        _user_cache.set(uid_int, user)
    return user


# ══════════════════════════════════════════════════════════
#  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ══════════════════════════════════════════════════════════
MOSCOW_TZ_OFFSET = timedelta(hours=3)


def to_moscow_str(dt):
    if not dt:
        return ''
    moscow_dt  = dt + MOSCOW_TZ_OFFSET
    now_moscow = datetime.utcnow() + MOSCOW_TZ_OFFSET
    if moscow_dt.date() == now_moscow.date():
        return moscow_dt.strftime('%H:%M')
    yesterday = now_moscow.date() - timedelta(days=1)
    if moscow_dt.date() == yesterday:
        return f'вчера {moscow_dt.strftime("%H:%M")}'
    return moscow_dt.strftime('%d.%m')


def get_cached_user(user_id):
    cached = _user_cache.get(user_id)
    if cached is not None:
        return cached
    user = db.session.get(User, user_id)
    if user:
        _user_cache.set(user_id, user)
    return user


def get_partner_id(chat, my_id):
    parts = chat.room_key.replace('chat_', '').split('_')
    return next((int(p) for p in parts if p.isdigit() and int(p) != my_id), None)


def get_or_create_chat(uid1, uid2):
    ids  = sorted([uid1, uid2])
    key  = f'chat_{ids[0]}_{ids[1]}'
    chat = Chat.query.filter_by(room_key=key).first()
    if not chat:
        chat = Chat(room_key=key)
        db.session.add(chat)
        db.session.commit()
    return chat


def emit_to_user(user_id, event, data, skip_sid=None):
    socketio.emit(event, data, room=f'user_{user_id}', skip_sid=skip_sid)


def broadcast_status(user_id, online, throttle_ms=500):
    now  = time.monotonic()
    last = _status_throttle.get(user_id, 0)
    if online or (now - last) > (throttle_ms / 1000):
        _status_throttle[user_id] = now
        _online_cache.set(user_id, online)
        socketio.emit('user_status', {'user_id': user_id, 'online': online})


def rate_limit(endpoint, max_calls=30, window_sec=60):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return f(*args, **kwargs)
            uid   = current_user.id
            now   = time.monotonic()
            calls = _rate_limits[uid][endpoint]
            calls[:] = [t for t in calls if now - t < window_sec]
            if len(calls) >= max_calls:
                return jsonify({'error': 'Too many requests'}), 429
            calls.append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator


# ══════════════════════════════════════════════════════════
#  AUTH — РЕГИСТРАЦИЯ И ВХОД (исправлено)
# ══════════════════════════════════════════════════════════
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        # Поддерживаем и form, и JSON
        if request.is_json:
            data     = request.get_json() or {}
            phone    = data.get('phone', '').strip()
            password = data.get('password', '').strip()
        else:
            phone    = request.form.get('phone', '').strip()
            password = request.form.get('password', '').strip()

        if not phone or not password:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Заполните все поля'}), 400
            flash('Заполните все поля', 'error')
            return render_template('login.html')

        u = User.query.filter_by(phone=phone).first()
        # Поддерживаем и passwordless (password_hash=None) и с паролем
        auth_ok = False
        if u:
            if u.password_hash is None:
                auth_ok = (password == '' or True)  # passwordless — принимаем любой
            else:
                auth_ok = check_password_hash(u.password_hash, password)
        if u and auth_ok:
            session.permanent = True
            login_user(u, remember=True)
            u.is_online = True
            u.last_seen = datetime.utcnow()
            db.session.commit()
            u.invalidate_cache()
            broadcast_status(u.id, True)
            if request.is_json:
                return jsonify({'success': True, 'redirect': url_for('index')})
            return redirect(url_for('index'))

        eventlet.sleep(0.3)
        if request.is_json:
            return jsonify({'success': False, 'error': 'Неправильный номер или пароль'}), 401
        flash('Неправильный номер или пароль', 'error')
    return render_template('login.html')


@app.route('/register', methods=['GET'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('login.html')


# ══════════════════════════════════════════════════════════
#  PASSWORDLESS AUTH — check_phone / send_code / verify_code
#  Фронтенд вызывает именно эти маршруты
# ══════════════════════════════════════════════════════════

@app.route('/check_phone', methods=['POST'])
def check_phone():
    """Проверяем, зарегистрирован ли номер. Возвращает exists=True/False."""
    try:
        data  = request.get_json() if request.is_json else request.form
        phone = (data.get('phone') or '').strip()
        if not phone:
            return jsonify({'success': False, 'error': 'Укажите номер телефона'}), 400
        exists = User.query.filter_by(phone=phone).first() is not None
        return jsonify({'success': True, 'exists': exists})
    except Exception as e:
        app.logger.error(f'check_phone: {e}')
        return jsonify({'success': False, 'error': 'Ошибка сервера'}), 500


@app.route('/send_code', methods=['POST'])
def send_code():
    """Генерируем и «отправляем» код. Для новых — требуем name+username."""
    try:
        data     = request.get_json() if request.is_json else request.form
        phone    = (data.get('phone')    or '').strip()
        name     = (data.get('name')     or '').strip()
        username = (data.get('username') or '').strip().lower().lstrip('@')

        if not phone:
            return jsonify({'success': False, 'error': 'Укажите номер телефона'}), 400

        existing = User.query.filter_by(phone=phone).first()

        # Для новых пользователей проверяем name/username
        if not existing:
            if not name or not username:
                return jsonify({'success': False, 'error': 'Введите имя и юзернейм'}), 400
            if len(username) < 4:
                return jsonify({'success': False, 'error': 'Юзернейм минимум 4 символа'}), 400
            if not username[0].isalpha():
                return jsonify({'success': False, 'error': 'Юзернейм должен начинаться с буквы'}), 400
            if not all(c.isalnum() or c == '_' for c in username):
                return jsonify({'success': False, 'error': 'Юзернейм: только буквы, цифры и _'}), 400
            if User.query.filter_by(username=username).first():
                return jsonify({'success': False, 'error': 'Юзернейм уже занят'}), 400

        code    = str(random.randint(100000, 999999))
        expires = time.time() + 600

        _pending_registrations[phone] = {
            'name':     name or (existing.name if existing else ''),
            'username': username or (existing.username if existing else ''),
            'code':     code,
            'expires':  expires,
            'is_login': existing is not None,
        }

        print(f'\n{"="*50}')
        print(f'📱 КОД для {phone}: {code}')
        print(f'{"="*50}\n')

        return jsonify({'success': True, 'message': 'Код отправлен', 'dev_code': code})

    except Exception as e:
        app.logger.error(f'send_code: {e}')
        return jsonify({'success': False, 'error': 'Ошибка сервера'}), 500


@app.route('/verify_code', methods=['POST'])
def verify_code():
    """Проверяем код и входим / регистрируем пользователя."""
    try:
        data  = request.get_json() if request.is_json else request.form
        phone = (data.get('phone') or '').strip()
        code  = (data.get('code')  or '').strip()

        if not phone or not code:
            return jsonify({'success': False, 'error': 'Заполните все поля'}), 400

        pending = _pending_registrations.get(phone)
        if not pending:
            return jsonify({'success': False, 'error': 'Сначала запросите код'}), 400
        if time.time() > pending['expires']:
            _pending_registrations.pop(phone, None)
            return jsonify({'success': False, 'error': 'Код истёк, запросите новый'}), 400
        if pending['code'] != code:
            return jsonify({'success': False, 'error': 'Неверный код'}), 400

        _pending_registrations.pop(phone, None)

        # Ищем или создаём пользователя
        u = User.query.filter_by(phone=phone).first()
        if not u:
            # Регистрация
            if User.query.filter_by(username=pending['username']).first():
                return jsonify({'success': False, 'error': 'Юзернейм уже занят'}), 400
            u = User(
                phone         = phone,
                name          = pending['name'][:120],
                username      = pending['username'][:80],
                password_hash = generate_password_hash('__passwordless__'),
            )
            db.session.add(u)
            db.session.commit()

        session.permanent = True
        login_user(u, remember=True)
        u.is_online  = True
        u.last_seen  = datetime.utcnow()
        db.session.commit()
        u.invalidate_cache()
        broadcast_status(u.id, True)

        return jsonify({'success': True, 'redirect': url_for('index')})

    except Exception as e:
        app.logger.error(f'verify_code: {e}')
        return jsonify({'success': False, 'error': 'Ошибка сервера'}), 500

# ══════════════════════════════════════════════════════════
#  АЛИАСЫ — login_step1 / login_step2 / register_step1 / register_step2
#  login.html вызывает эти маршруты
# ══════════════════════════════════════════════════════════

@app.route('/login_step1', methods=['POST'])
def login_step1():
    """Алиас send_code."""
    return send_code()

@app.route('/login_step2', methods=['POST'])
def login_step2():
    """Алиас verify_code."""
    return verify_code()



# ══════════════════════════════════════════════════════════
#  ДВУХШАГОВАЯ РЕГИСТРАЦИЯ (register_step1 / register_step2)
#  Используется если фронтенд отправляет форму в 2 шага
# ══════════════════════════════════════════════════════════

# Временное хранилище pending-регистраций (в памяти, для прод используй Redis)
_pending_registrations = {}   # phone -> {name, username, password, code, expires}


def _gen_code():
    return str(random.randint(100000, 999999))

@app.route('/register_step1', methods=['GET', 'POST'])
def register_step1():
    """Шаг 1: phone + name + username → генерируем код"""
    if current_user.is_authenticated:
        return jsonify({'success': True, 'redirect': url_for('index')})

    if request.method != 'POST':
        return render_template('login.html')

    try:
        if request.is_json:
            data = request.get_json() or {}
        else:
            data = request.form

        phone    = (data.get('phone', '') or '').strip()
        name     = (data.get('name',  '') or '').strip()
        username = (data.get('username', '') or '').strip().lower().lstrip('@')

        errors = []
        if not all([phone, name, username]):
            errors.append('Заполните все поля')
        elif len(username) < 4:
            errors.append('Юзернейм минимум 4 символа')
        elif not username[0].isalpha():
            errors.append('Юзернейм должен начинаться с буквы')
        elif not all(c.isalnum() or c == '_' for c in username):
            errors.append('Юзернейм: только буквы, цифры и _')

        if not errors:
            if User.query.filter_by(phone=phone).first():
                errors.append('Этот номер уже зарегистрирован')
            elif User.query.filter_by(username=username).first():
                errors.append('Этот юзернейм уже занят')

        if errors:
            return jsonify({'success': False, 'error': errors[0]}), 400

        code    = _gen_code()
        expires = time.time() + 600

        _pending_registrations[phone] = {
            'name':     name,
            'username': username,
            'code':     code,
            'expires':  expires,
        }

        print(f'\n{"="*50}')
        print(f'📱 КОД ПОДТВЕРЖДЕНИЯ для {phone}: {code}')
        print(f'{"="*50}\n')

        return jsonify({
            'success':  True,
            'message':  'Код отправлен',
            'dev_code': code,
        })

    except Exception as e:
        app.logger.error(f'register_step1 error: {e}')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500


@app.route('/register_step2', methods=['GET', 'POST'])
def register_step2_page():
    """Шаг 2: код + пароль → создаём пользователя"""
    if current_user.is_authenticated:
        return jsonify({'success': True, 'redirect': url_for('index')})

    if request.method != 'POST':
        return render_template('login.html')

    try:
        if request.is_json:
            data = request.get_json() or {}
        else:
            data = request.form

        phone = (data.get('phone', '') or '').strip()
        code  = (data.get('code',  '') or '').strip()

        pending = _pending_registrations.get(phone)

        if not pending:
            return jsonify({'success': False, 'error': 'Сначала введите данные на шаге 1'}), 400

        if time.time() > pending['expires']:
            _pending_registrations.pop(phone, None)
            return jsonify({'success': False, 'error': 'Код истёк, попробуйте снова'}), 400

        if pending['code'] != code:
            return jsonify({'success': False, 'error': 'Неверный код'}), 400

        if User.query.filter_by(phone=phone).first():
            return jsonify({'success': False, 'error': 'Номер уже зарегистрирован'}), 400
        if User.query.filter_by(username=pending['username']).first():
            return jsonify({'success': False, 'error': 'Юзернейм уже занят'}), 400

        u = User(
            phone         = phone,
            name          = pending['name'][:120],
            username      = pending['username'][:80],
            password_hash = generate_password_hash('__passwordless__'),
        )
        db.session.add(u)
        db.session.commit()
        _pending_registrations.pop(phone, None)

        session.permanent = True
        login_user(u, remember=True)

        return jsonify({'success': True, 'redirect': url_for('index')})

    except Exception as e:
        app.logger.error(f'register_step2 error: {e}')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500


# ══════════════════════════════════════════════════════════
#  WEB PUSH — РОУТЫ
# ══════════════════════════════════════════════════════════

@app.route('/vapid-public-key')
def vapid_public_key():
    pub, _ = _get_vapid_keys()
    return jsonify({'publicKey': pub or ''})


@app.route('/sw.js')
def service_worker():
    from flask import send_from_directory
    resp = send_from_directory(os.path.join(BASE_DIR, 'static'), 'sw.js')
    resp.headers['Content-Type']  = 'application/javascript'
    resp.headers['Cache-Control'] = 'no-cache, no-store'
    resp.headers['Service-Worker-Allowed'] = '/'
    return resp


@app.route('/manifest.json')
def manifest():
    from flask import send_from_directory
    return send_from_directory(os.path.join(BASE_DIR, 'static'), 'manifest.json')


@app.route('/push-subscribe', methods=['POST'])
@login_required
def push_subscribe():
    data     = request.get_json() or {}
    endpoint = data.get('endpoint', '').strip()
    p256dh   = data.get('p256dh', '').strip()
    auth     = data.get('auth', '').strip()

    if not endpoint or not p256dh or not auth:
        return jsonify({'success': False, 'error': 'Missing fields'}), 400

    # Upsert — обновляем если уже есть
    existing = PushSubscription.query.filter_by(
        user_id=current_user.id, endpoint=endpoint
    ).first()

    if not existing:
        sub = PushSubscription(
            user_id  = current_user.id,
            endpoint = endpoint,
            p256dh   = p256dh,
            auth     = auth,
        )
        db.session.add(sub)
    else:
        existing.p256dh = p256dh
        existing.auth   = auth

    db.session.commit()
    return jsonify({'success': True})


@app.route('/push-unsubscribe', methods=['POST'])
@login_required
def push_unsubscribe():
    data     = request.get_json() or {}
    endpoint = data.get('endpoint', '').strip()
    if endpoint:
        PushSubscription.query.filter_by(
            user_id=current_user.id, endpoint=endpoint
        ).delete()
    else:
        PushSubscription.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'success': True})


@app.route('/logout')
@login_required
def logout():
    uid = current_user.id
    current_user.is_online = False
    current_user.last_seen = datetime.utcnow()
    db.session.commit()
    current_user.invalidate_cache()
    broadcast_status(uid, False)
    logout_user()
    return redirect(url_for('login'))


# ══════════════════════════════════════════════════════════
#  ГЛАВНАЯ
# ══════════════════════════════════════════════════════════
@app.route('/')
@login_required
def index():
    return render_template('index.html', currentUser=current_user)


# ══════════════════════════════════════════════════════════
#  API — ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
# ══════════════════════════════════════════════════════════
@app.route('/get_current_user')
@login_required
def get_current_user_route():
    u = current_user
    return jsonify({
        'id':       u.id,
        'name':     u.name,
        'username': u.username,
        'avatar':   u.avatar,
        'bio':      u.bio or '',
        'phone':    u.phone,
    })


# ══════════════════════════════════════════════════════════
#  API — ПРОФИЛЬ ПАРТНЁРА
# ══════════════════════════════════════════════════════════
@app.route('/get_user_profile/<int:user_id>')
@login_required
def get_user_profile(user_id):
    cached = _partner_cache.get(user_id)
    if cached:
        return jsonify(cached)
    u = get_cached_user(user_id)
    if not u:
        return jsonify({'error': 'Not found'}), 404
    data = {
        'id':         u.id,
        'name':       u.name,
        'username':   u.username,
        'avatar':     u.avatar,
        'bio':        u.bio or '',
        'online':     u.online_status,
        'phone':      u.phone,
        'created_at': u.created_at.isoformat() if u.created_at else None,
    }
    _partner_cache.set(user_id, data)
    resp = make_response(jsonify(data))
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


# ══════════════════════════════════════════════════════════
#  API — СПИСОК ЧАТОВ (личные + группы)
# ══════════════════════════════════════════════════════════
@app.route('/get_my_chats')
@login_required
def get_my_chats():
    try:
        db.session.rollback()
    except Exception:
        pass
    uid = current_user.id
    cached = _chat_cache.get(uid)
    if cached:
        return jsonify(cached)

    result = []

    # ── Личные чаты ──
    raw_chats = Chat.query.filter(
        or_(
            Chat.room_key.like(f'chat_{uid}_%'),
            Chat.room_key.like(f'%_{uid}'),
        )
    ).all()

    for c in raw_chats:
        # Пропускаем групповые чаты
        if c.room_key.startswith('group_'):
            continue
        try:
            parts = c.room_key.replace('chat_', '').split('_')
            ids   = [int(p) for p in parts if p.isdigit()]
            p_id  = next((i for i in ids if i != uid), None)
            if not p_id:
                continue
            partner = get_cached_user(p_id)
            if not partner:
                continue

            last_msg = Message.query.filter_by(
                chat_id=c.id, is_deleted=False
            ).order_by(Message.id.desc()).first()

            unread = db.session.execute(
                text('SELECT COUNT(*) FROM message WHERE chat_id=:cid AND is_read=FALSE AND sender_id!=:uid AND is_deleted=FALSE'),
                {'cid': c.id, 'uid': uid}
            ).scalar() or 0

            type_map = {'image': '🖼 Фото', 'audio': '🎙️ Голос', 'video': '📹 Видео'}
            preview  = '💬 Начните переписку'
            sort_ts  = c.created_at or datetime(2000, 1, 1)

            if last_msg:
                preview = type_map.get(last_msg.type, last_msg.content or '...')
                sort_ts = last_msg.timestamp

            _mc = Moment.query.filter(Moment.user_id==p_id, Moment.expires_at>datetime.utcnow()).count()
            result.append({
                'chat_id':          c.id,
                'partner_id':       p_id,
                'partner_name':     partner.name,
                'partner_username': partner.username,
                'partner_avatar':   partner.avatar,
                'online':           partner.online_status,
                'last_message':     preview,
                'timestamp':        to_moscow_str(last_msg.timestamp if last_msg else None),
                'raw_timestamp':    last_msg.timestamp.isoformat() + 'Z' if last_msg and last_msg.timestamp else '',
                'unread_count':     unread,
                'is_group':         False,
                'has_moment':       _mc > 0,
                'moment_count':     _mc,
                '_sort':            sort_ts,
            })
        except Exception as e:
            app.logger.error(f'Chat parse error {c.id}: {e}')

    # ── Групповые чаты ──
    memberships = GroupMember.query.filter_by(user_id=uid).all()
    for m in memberships:
        try:
            group = db.session.get(Group, m.group_id)
            if not group:
                continue

            chat = db.session.get(Chat, group.chat_id) if group.chat_id else None
            if not chat:
                continue

            last_msg = Message.query.filter_by(
                chat_id=chat.id, is_deleted=False
            ).order_by(Message.id.desc()).first()

            unread = db.session.execute(
                text('SELECT COUNT(*) FROM message WHERE chat_id=:cid AND is_read=FALSE AND sender_id!=:uid AND is_deleted=FALSE'),
                {'cid': chat.id, 'uid': uid}
            ).scalar() or 0

            type_map = {'image': '🖼 Фото', 'audio': '🎙️ Голос', 'video': '📹 Видео'}
            preview  = '👥 Группа создана'
            sort_ts  = group.created_at or datetime(2000, 1, 1)

            if last_msg:
                sender_prefix = f'{last_msg.sender_name}: ' if last_msg.sender_name else ''
                preview = sender_prefix + (type_map.get(last_msg.type, last_msg.content or '...'))
                sort_ts = last_msg.timestamp

            member_count = GroupMember.query.filter_by(group_id=group.id).count()

            result.append({
                'chat_id':      chat.id,
                'group_id':     group.id,
                'partner_id':   group.id,
                'group_name':   group.name,
                'partner_name': group.name,
                'group_avatar': group.avatar,
                'partner_avatar': group.avatar,
                'member_count': member_count,
                'online':       False,
                'last_message': preview,
                'timestamp':    to_moscow_str(last_msg.timestamp if last_msg else None),
                'raw_timestamp': last_msg.timestamp.isoformat() + 'Z' if last_msg and last_msg.timestamp else '',
                'unread_count': unread,
                'is_group':     True,
                '_sort':        sort_ts,
            })
        except Exception as e:
            app.logger.error(f'Group chat parse error {m.group_id}: {e}')

    def sort_key(x):
        s = x.get('_sort')
        if isinstance(s, datetime):
            return s
        if isinstance(s, str):
            try:
                return datetime.fromisoformat(s.replace('Z',''))
            except Exception:
                pass
        return datetime(2000, 1, 1)

    result.sort(key=sort_key, reverse=True)
    for r in result:
        r.pop('_sort', None)

    _chat_cache.set(uid, result)
    return jsonify(result)


# ══════════════════════════════════════════════════════════
#  API — ПОЛУЧИТЬ ID ЛИЧНОГО ЧАТА
# ══════════════════════════════════════════════════════════
@app.route('/get_chat_id/<int:partner_id>')
@login_required
def get_chat_id(partner_id):
    partner = get_cached_user(partner_id)
    if not partner:
        return jsonify({'error': 'User not found'}), 404

    chat = get_or_create_chat(current_user.id, partner_id)
    _chat_cache.delete(current_user.id)
    _chat_cache.delete(partner_id)

    return jsonify({
        'chat_id':        chat.id,
        'partner_online': partner.online_status,
    })


# ══════════════════════════════════════════════════════════
#  API — ПОЛУЧИТЬ ID ГРУППОВОГО ЧАТА
# ══════════════════════════════════════════════════════════
@app.route('/get_group_chat_id/<int:group_id>')
@login_required
def get_group_chat_id(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    # Проверяем что пользователь в группе
    member = GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first()
    if not member:
        return jsonify({'error': 'Not a member'}), 403

    member_count = GroupMember.query.filter_by(group_id=group_id).count()

    return jsonify({
        'chat_id':      group.chat_id,
        'group_name':   group.name,
        'group_avatar': group.avatar,
        'member_count': member_count,
    })


# ══════════════════════════════════════════════════════════
#  API — СООБЩЕНИЯ (cursor-based, 35 за раз)
# ══════════════════════════════════════════════════════════
@app.route('/get_messages/<int:chat_id>')
@login_required
def get_messages(chat_id):
    try:
        db.session.rollback()
    except Exception:
        pass
    limit     = min(request.args.get('limit', 35, type=int), 100)
    before_id = request.args.get('before_id', None, type=int)

    # Помечаем прочитанными
    db.session.execute(
        text('UPDATE message SET is_read=TRUE WHERE chat_id=:cid AND is_read=FALSE AND sender_id!=:uid AND is_deleted=FALSE'),
        {'cid': chat_id, 'uid': current_user.id}
    )
    db.session.commit()

    # Уведомляем партнёра
    chat = db.session.get(Chat, chat_id)
    if chat and not chat.room_key.startswith('group_'):
        p_id = get_partner_id(chat, current_user.id)
        if p_id:
            emit_to_user(p_id, 'messages_read_bulk', {'chat_id': chat_id})

    query = Message.query.filter_by(chat_id=chat_id, is_deleted=False)
    if before_id:
        query = query.filter(Message.id < before_id)

    msgs = query.order_by(Message.id.desc()).limit(limit).all()
    _chat_cache.delete(current_user.id)

    return jsonify([m.to_dict() for m in reversed(msgs)])


# ══════════════════════════════════════════════════════════
#  API — СОЗДАНИЕ ГРУППЫ
# ══════════════════════════════════════════════════════════
@app.route('/create_group', methods=['POST'])
@login_required
@rate_limit('create_group', max_calls=5, window_sec=3600)
def create_group():
    name    = request.form.get('name', '').strip()[:64]
    members_raw = request.form.get('members', '[]')

    if not name:
        return jsonify({'success': False, 'error': 'Нет названия'}), 400

    try:
        member_ids = json.loads(members_raw)
    except Exception:
        return jsonify({'success': False, 'error': 'Неверный формат участников'}), 400

    if len(member_ids) < 2:
        return jsonify({'success': False, 'error': 'Минимум 2 участника'}), 400

    # Загружаем аватар группы
    avatar_url = '/static/default_avatar.png'
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and file.filename:
            ext = (file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg').lower()
            filename = f'group_{uuid.uuid4().hex[:10]}.{ext}'
            filepath = os.path.join(GROUP_AVA_FOLDER, filename)
            file.save(filepath)
            avatar_url = '/static/uploads/groups/' + filename

    # Создаём чат для группы
    group_chat_key = f'group_{uuid.uuid4().hex[:16]}'
    chat = Chat(room_key=group_chat_key)
    db.session.add(chat)
    db.session.flush()

    # Создаём группу
    group = Group(
        name       = name,
        avatar     = avatar_url,
        creator_id = current_user.id,
        chat_id    = chat.id,
    )
    db.session.add(group)
    db.session.flush()

    # Добавляем создателя как админа
    db.session.add(GroupMember(group_id=group.id, user_id=current_user.id, is_admin=True))

    # Добавляем участников
    added_ids = set()
    added_ids.add(current_user.id)
    for uid in member_ids:
        uid = int(uid)
        if uid not in added_ids:
            u = get_cached_user(uid)
            if u:
                db.session.add(GroupMember(group_id=group.id, user_id=uid, is_admin=False))
                added_ids.add(uid)

    db.session.commit()

    # Инвалидируем кэш всех участников
    for uid in added_ids:
        _chat_cache.delete(uid)

    # Уведомляем всех участников о новой группе
    for uid in added_ids:
        if uid != current_user.id:
            emit_to_user(uid, 'new_group_chat', {
                'group_id':   group.id,
                'group_name': name,
                'group_avatar': avatar_url,
                'created_by': current_user.name,
            })

    # Системное сообщение в группу
    sys_msg = Message(
        chat_id     = chat.id,
        sender_id   = current_user.id,
        sender_name = current_user.name,
        type        = 'text',
        content     = f'👥 Группа "{name}" создана. Участников: {len(added_ids)}',
    )
    db.session.add(sys_msg)
    db.session.commit()

    return jsonify({
        'success':  True,
        'group_id': group.id,
        'chat_id':  chat.id,
        'avatar':   avatar_url,
    })


# ══════════════════════════════════════════════════════════
#  API — УЧАСТНИКИ ГРУППЫ
# ══════════════════════════════════════════════════════════
@app.route('/get_group_members/<int:group_id>')
@login_required
def get_group_members(group_id):
    member = GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first()
    if not member:
        return jsonify({'error': 'Forbidden'}), 403

    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({'error': 'Not found'}), 404

    members = db.session.query(GroupMember, User).join(
        User, GroupMember.user_id == User.id
    ).filter(GroupMember.group_id == group_id).all()

    return jsonify({
        'group_id':   group_id,
        'group_name': group.name,
        'creator_id': group.creator_id,
        'my_id':      current_user.id,
        'i_am_admin': member.is_admin,
        'members': [{
            'id':       m.User.id,
            'name':     m.User.name,
            'username': m.User.username,
            'avatar':   m.User.avatar,
            'online':   m.User.online_status,
            'is_admin': m.GroupMember.is_admin,
        } for m in members]
    })


# ══════════════════════════════════════════════════════════
#  API — ДОБАВИТЬ УЧАСТНИКА В ГРУППУ
# ══════════════════════════════════════════════════════════
@app.route('/add_group_member', methods=['POST'])
@login_required
def add_group_member():
    data     = request.get_json() or {}
    group_id = data.get('group_id')
    user_id  = data.get('user_id')

    if not group_id or not user_id:
        return jsonify({'success': False, 'error': 'Missing params'}), 400

    # Только админ может добавлять
    admin_check = GroupMember.query.filter_by(
        group_id=group_id, user_id=current_user.id, is_admin=True
    ).first()
    if not admin_check:
        return jsonify({'success': False, 'error': 'Not admin'}), 403

    exists = GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()
    if exists:
        return jsonify({'success': False, 'error': 'Already a member'}), 400

    u = get_cached_user(user_id)
    if not u:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    db.session.add(GroupMember(group_id=group_id, user_id=user_id, is_admin=False))
    db.session.commit()

    _chat_cache.delete(user_id)
    group = db.session.get(Group, group_id)

    emit_to_user(user_id, 'new_group_chat', {
        'group_id':   group_id,
        'group_name': group.name if group else '',
        'group_avatar': group.avatar if group else '',
    })

    socketio.emit('group_member_added', {
        'group_id':   group_id,
        'member_id':  user_id,
        'member_name': u.name,
    }, room=f'group_{group_id}')

    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — ПОКИНУТЬ ГРУППУ
# ══════════════════════════════════════════════════════════
@app.route('/leave_group/<int:group_id>', methods=['POST'])
@login_required
def leave_group(group_id):
    member = GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 400

    db.session.delete(member)
    db.session.commit()
    _chat_cache.delete(current_user.id)

    socketio.emit('group_member_left', {
        'group_id':   group_id,
        'member_id':  current_user.id,
        'member_name': current_user.name,
    }, room=f'group_{group_id}')

    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — ИСКЛЮЧИТЬ УЧАСТНИКА ИЗ ГРУППЫ (только для админов)
# ══════════════════════════════════════════════════════════
@app.route('/kick_group_member', methods=['POST'])
@login_required
def kick_group_member():
    data     = request.get_json() or {}
    group_id = data.get('group_id')
    user_id  = data.get('user_id')

    if not group_id or not user_id:
        return jsonify({'success': False, 'error': 'Missing params'}), 400

    # Только админ может кикать
    my_member = GroupMember.query.filter_by(
        group_id=group_id, user_id=current_user.id, is_admin=True
    ).first()
    if not my_member:
        return jsonify({'success': False, 'error': 'Нет прав администратора'}), 403

    # Нельзя кикнуть создателя группы
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Группа не найдена'}), 404
    if user_id == group.creator_id:
        return jsonify({'success': False, 'error': 'Нельзя исключить создателя группы'}), 403

    target = GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()
    if not target:
        return jsonify({'success': False, 'error': 'Участник не найден'}), 404

    db.session.delete(target)
    db.session.commit()
    _chat_cache.delete(user_id)

    # Уведомляем кикнутого и остальных
    emit_to_user(user_id, 'kicked_from_group', {'group_id': group_id})
    socketio.emit('group_member_left', {
        'group_id':   group_id,
        'member_id':  user_id,
    }, room=f'group_{group_id}')

    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — НАЗНАЧИТЬ/СНЯТЬ АДМИНИСТРАТОРА (только создатель)
# ══════════════════════════════════════════════════════════
@app.route('/set_group_admin', methods=['POST'])
@login_required
def set_group_admin():
    data     = request.get_json() or {}
    group_id = data.get('group_id')
    user_id  = data.get('user_id')
    is_admin = bool(data.get('is_admin', True))

    if not group_id or not user_id:
        return jsonify({'success': False, 'error': 'Missing params'}), 400

    group = db.session.get(Group, group_id)
    if not group or group.creator_id != current_user.id:
        return jsonify({'success': False, 'error': 'Только создатель может назначать админов'}), 403

    target = GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()
    if not target:
        return jsonify({'success': False, 'error': 'Участник не найден'}), 404

    target.is_admin = is_admin
    db.session.commit()

    return jsonify({'success': True})
@app.route('/search_users')
@login_required
@rate_limit('search', max_calls=20, window_sec=60)
def search_users():
    q     = request.args.get('q', '').strip()
    phone = request.args.get('phone', '').strip()

    if not q and not phone:
        return jsonify([])

    if phone:
        clean_phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        users = User.query.filter(
            User.id != current_user.id,
            User.is_blocked == False,
            or_(
                User.phone == phone,
                User.phone == clean_phone,
                User.phone.like(f'%{clean_phone[-7:]}%') if len(clean_phone) >= 7 else text('0'),
            )
        ).limit(5).all()
    else:
        q_lower = q.lower()
        users = User.query.filter(
            User.id != current_user.id,
            User.is_blocked == False,
            or_(
                func.lower(User.name).like(f'%{q_lower}%'),
                func.lower(User.username).like(f'%{q_lower}%'),
            )
        ).limit(20).all()

    return jsonify([{
        'id':         u.id,
        'name':       u.name,
        'username':   u.username,
        'avatar_url': u.avatar,
        'avatar':     u.avatar,
        'online':     u.online_status,
        'phone':      u.phone,
    } for u in users])


# ══════════════════════════════════════════════════════════
#  API — ОБНОВЛЕНИЕ ПРОФИЛЯ
# ══════════════════════════════════════════════════════════
@app.route('/update_profile', methods=['POST'])
@login_required
@rate_limit('update_profile', max_calls=10, window_sec=60)
def update_profile():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    bio  = data.get('bio', None)

    if name:
        current_user.name = name[:120]
    if bio is not None:
        current_user.bio = bio[:500]

    db.session.commit()
    current_user.invalidate_cache()
    _partner_cache.delete(current_user.id)

    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — АВАТАРЫ
# ══════════════════════════════════════════════════════════
ALLOWED_AVATAR_EXTS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}


@app.route('/upload_avatar', methods=['POST'])
@login_required
@rate_limit('upload_avatar', max_calls=5, window_sec=60)
def upload_avatar():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'Нет файла'}), 400

    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

    ext = (file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg').lower()
    if ext not in ALLOWED_AVATAR_EXTS:
        return jsonify({'success': False, 'error': 'Неподдерживаемый формат'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'Файл слишком большой (макс 5 МБ)'}), 400

    # Удаляем старый
    old_avatar = current_user.avatar
    if old_avatar and old_avatar.startswith('/static/uploads/avatars/'):
        old_path = os.path.join(BASE_DIR, old_avatar.lstrip('/'))
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass

    filename = f'ava_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}'
    file.seek(0)
    url = upload_to_cloudinary(file, folder='waychat/avatars')
    if not url:
        return jsonify({'success': False, 'error': 'Ошибка загрузки. Проверьте настройки Cloudinary.'}), 500
    current_user.avatar = url
    db.session.commit()
    current_user.invalidate_cache()
    _partner_cache.delete(current_user.id)

    payload = {'user_id': current_user.id, 'avatar': url}
    socketio.emit('avatar_updated', payload)

    return jsonify({'success': True, 'avatar_url': url})


@app.route('/upload_avatar_emoji', methods=['POST'])
@login_required
def upload_avatar_emoji():
    data  = request.get_json() or {}
    emoji = data.get('emoji', '').strip()
    if not emoji or len(emoji) > 8:
        return jsonify({'success': False, 'error': 'Invalid emoji'}), 400

    current_user.avatar = f'emoji:{emoji}'
    db.session.commit()
    current_user.invalidate_cache()
    _partner_cache.delete(current_user.id)

    socketio.emit('avatar_updated', {'user_id': current_user.id, 'avatar': f'emoji:{emoji}'})
    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — ЗАГРУЗКА МЕДИА
# ══════════════════════════════════════════════════════════
@app.route('/upload_media', methods=['POST'])
@login_required
@rate_limit('upload_media', max_calls=30, window_sec=60)
def upload_media():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'Нет файла'}), 400

    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

    mime      = file.content_type or mimetypes.guess_type(file.filename)[0] or ''
    file_type = 'file'
    if mime.startswith('image/'):   file_type = 'image'
    elif mime.startswith('video/'): file_type = 'video'
    elif mime.startswith('audio/'): file_type = 'audio'

    ext = (file.filename.rsplit('.', 1)[-1] if '.' in file.filename else '').lower()
    if not ext:
        ext = {'image': 'jpg', 'video': 'mp4', 'audio': 'ogg'}.get(file_type, 'bin')

    filename = f'msg_{current_user.id}_{uuid.uuid4().hex[:12]}.{ext}'
    file.seek(0)
    url = upload_to_cloudinary(file, folder='waychat/messages')
    if not url:
        return jsonify({'success': False, 'error': 'Ошибка загрузки файла'}), 500
    return jsonify({'success': True, 'url': url, 'type': file_type})


# ══════════════════════════════════════════════════════════
#  API — УДАЛЕНИЕ СООБЩЕНИЯ
# ══════════════════════════════════════════════════════════
@app.route('/delete_message/<int:msg_id>', methods=['DELETE'])
@login_required
def delete_message_route(msg_id):
    msg = db.session.get(Message, msg_id)
    if not msg:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if msg.sender_id != current_user.id:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403

    msg.is_deleted = True
    msg.content    = None
    db.session.commit()

    chat = db.session.get(Chat, msg.chat_id)
    if chat:
        if chat.room_key.startswith('group_'):
            socketio.emit('message_deleted', {'msg_id': msg_id, 'chat_id': msg.chat_id}, room=f'chat_{msg.chat_id}')
        else:
            p_id = get_partner_id(chat, current_user.id)
            if p_id:
                emit_to_user(p_id, 'message_deleted', {'msg_id': msg_id, 'chat_id': msg.chat_id})

    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — БЛОКИРОВКА
# ══════════════════════════════════════════════════════════
@app.route('/block_user/<int:user_id>', methods=['POST'])
@login_required
def block_user(user_id):
    if user_id == current_user.id:
        return jsonify({'success': False}), 400
    existing = BlockedUser.query.filter_by(blocker_id=current_user.id, blocked_id=user_id).first()
    if not existing:
        db.session.add(BlockedUser(blocker_id=current_user.id, blocked_id=user_id))
        db.session.commit()
    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════
#  API — МОМЕНТЫ
# ══════════════════════════════════════════════════════════
@app.route('/get_moments')
@login_required
def get_moments():
    cached = _moments_cache.get('all')
    if cached:
        return jsonify(cached)

    cutoff  = datetime.utcnow() - timedelta(hours=24)
    moments = db.session.query(Moment, User).join(
        User, Moment.user_id == User.id
    ).filter(Moment.timestamp >= cutoff).order_by(Moment.timestamp.desc()).all()

    data = [{
        'id':          m.Moment.id,
        'user_id':     m.Moment.user_id,
        'user_name':   m.User.name,
        'user_avatar': m.User.avatar,
        'media_url':   m.Moment.media_url,
        'text':        m.Moment.text or '',
        'geo_name':    m.Moment.geo_name or '',
        'timestamp':   to_moscow_str(m.Moment.timestamp),
        'raw_timestamp': m.Moment.timestamp.isoformat() + 'Z' if m.Moment.timestamp else '',
        'view_count':  MomentView.query.filter_by(moment_id=m.Moment.id).count(),
        'is_mine':     m.Moment.user_id == current_user.id,
    } for m in moments]

    _moments_cache.set('all', data)
    return jsonify(data)


@app.route('/delete_chat/<int:cid>', methods=['POST'])
@login_required
def delete_chat_route(cid):
    chat = db.session.get(Chat, cid)
    if not chat: return jsonify({'success':False}), 404
    uid = str(current_user.id)
    if not (uid in chat.room_key.replace('chat_','').split('_') or chat.room_key.startswith('group_')):
        return jsonify({'success':False,'error':'Нет доступа'}), 403
    Message.query.filter_by(chat_id=cid).delete()
    db.session.delete(chat); db.session.commit()
    _chat_cache.delete(current_user.id)
    return jsonify({'success':True})


@app.route('/view_moment/<int:mid>', methods=['POST'])
@login_required
def view_moment(mid):
    if MomentView.query.filter_by(moment_id=mid, viewer_id=current_user.id).first():
        return jsonify({'success': True})
    mv = MomentView(moment_id=mid, viewer_id=current_user.id)
    db.session.add(mv)
    try: db.session.commit()
    except: db.session.rollback()
    return jsonify({'success': True})


@app.route('/moment_viewers/<int:mid>')
@login_required
def moment_viewers(mid):
    m = db.session.get(Moment, mid)
    if not m or m.user_id != current_user.id:
        return jsonify({'success': False, 'viewers': []})
    views = db.session.query(MomentView, User).join(User, User.id==MomentView.viewer_id)        .filter(MomentView.moment_id==mid).order_by(MomentView.viewed_at.desc()).all()
    return jsonify({'success': True, 'viewers': [
        {'id': v.User.id, 'name': v.User.name, 'avatar': v.User.avatar or '',
         'time': to_moscow_str(v.MomentView.viewed_at)}
        for v in views
    ]})


@app.route('/delete_moment/<int:mid>', methods=['POST'])
@login_required
def delete_moment(mid):
    m = db.session.get(Moment, mid)
    if not m: return jsonify({'success':False}), 404
    if m.user_id != current_user.id: return jsonify({'success':False,'error':'Нет доступа'}), 403
    if m.media_url:
        fp = os.path.join(BASE_DIR, m.media_url.lstrip('/'))
        if os.path.exists(fp):
            try: os.remove(fp)
            except: pass
    db.session.delete(m); db.session.commit()
    _moments_cache.delete('all')
    return jsonify({'success':True})


@app.route('/create_moment', methods=['POST'])
@login_required
@rate_limit('create_moment', max_calls=10, window_sec=3600)
def create_moment():
    media_url = None
    if 'file' in request.files:
        file = request.files['file']
        if file and file.filename:
            ext      = (file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg').lower()
            filename = f'moment_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}'
            file.seek(0)
            media_url = upload_to_cloudinary(file, folder='waychat/moments')
            if not media_url:
                return jsonify({'success': False, 'error': 'Ошибка загрузки медиа'}), 500

    text_content = request.form.get('text', '').strip()[:500]
    geo_name     = request.form.get('geo_name','').strip()[:200] or None
    geo_lat      = request.form.get('geo_lat', '').strip()[:20]  or None
    geo_lng      = request.form.get('geo_lng', '').strip()[:20]  or None
    if not media_url and not text_content:
        return jsonify({'success': False, 'error': 'Нет контента'}), 400

    moment = Moment(
        user_id    = current_user.id,
        media_url  = media_url,
        text       = text_content,
        geo_name   = geo_name,
        geo_lat    = geo_lat,
        geo_lng    = geo_lng,
        expires_at = datetime.utcnow() + timedelta(hours=24)
    )
    db.session.add(moment)
    db.session.commit()
    _moments_cache.delete('all')

    socketio.emit('new_moment', {'user_id': current_user.id, 'user_name': current_user.name})
    return jsonify({'success': True, 'moment_id': moment.id})


# ══════════════════════════════════════════════════════════
#  SOCKET.IO — ОБРАБОТЧИКИ
# ══════════════════════════════════════════════════════════
@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        join_room(f'user_{current_user.id}')
        current_user.is_online = True
        current_user.last_seen = datetime.utcnow()
        db.session.commit()
        current_user.invalidate_cache()
        broadcast_status(current_user.id, True)

        # Подключаем к групповым комнатам
        memberships = GroupMember.query.filter_by(user_id=current_user.id).all()
        for m in memberships:
            group = db.session.get(Group, m.group_id)
            if group and group.chat_id:
                join_room(f'chat_{group.chat_id}')


@socketio.on('join')
def on_join(data):
    if current_user.is_authenticated:
        join_room(f'user_{current_user.id}')
        current_user.is_online = True
        db.session.commit()
        current_user.invalidate_cache()
        broadcast_status(current_user.id, True)


@socketio.on('disconnect')
def on_disconnect():
    if current_user.is_authenticated:
        uid = current_user.id
        current_user.is_online = False
        current_user.last_seen = datetime.utcnow()
        db.session.commit()
        current_user.invalidate_cache()
        broadcast_status(uid, False)


@socketio.on('enter_chat')
def on_enter_chat(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return
    join_room(f'chat_{chat_id}')
    # Помечаем прочитанными
    db.session.execute(
        text('UPDATE message SET is_read=TRUE WHERE chat_id=:cid AND is_read=FALSE AND sender_id!=:uid AND is_deleted=FALSE'),
        {'cid': chat_id, 'uid': current_user.id}
    )
    db.session.commit()
    _chat_cache.delete(current_user.id)


@socketio.on('leave_chat')
def on_leave_chat(data):
    if current_user.is_authenticated and data.get('chat_id'):
        leave_room(f'chat_{data["chat_id"]}')


@socketio.on('send_message')
def handle_msg(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return

    msg_type = data.get('type_msg') or data.get('type', 'text')
    if msg_type == 'send_message':
        msg_type = 'text'

    msg = Message(
        chat_id     = chat_id,
        sender_id   = current_user.id,
        sender_name = current_user.name,
        type        = msg_type,
        content     = (data.get('content') or '')[:10000],
        file_url    = data.get('file_url'),
    )
    db.session.add(msg)
    db.session.commit()

    _chat_cache.delete(current_user.id)

    payload = msg.to_dict()
    payload['chat_id'] = chat_id
    chat = db.session.get(Chat, chat_id)

    if chat:
        # Превью текста для push
        push_preview = {
            'text':  msg.content or '',
            'image': '🖼 Фото',
            'audio': '🎙 Голосовое',
            'video': '📹 Видео',
        }.get(msg_type, msg.content or '...')
        push_preview = push_preview[:80] if push_preview else '...'
        sender_name  = current_user.name

        if chat.room_key.startswith('group_'):
            # Групповое — рассылаем всем участникам
            group = Group.query.filter_by(chat_id=chat_id).first()
            if group:
                payload['is_group_msg'] = True
                payload['group_id']     = group.id
                members = GroupMember.query.filter_by(group_id=group.id).all()
                for m in members:
                    _chat_cache.delete(m.user_id)
                    emit('new_message', payload, room=f'user_{m.user_id}')
                    # Push только тем кто не онлайн и не отправитель
                    if m.user_id != current_user.id:
                        is_online = _online_cache.get(m.user_id)
                        if not is_online:
                            eventlet.spawn(send_push_to_user,
                                m.user_id,
                                f'{sender_name} → {group.name}',
                                push_preview,
                                chat_id)
        else:
            payload['is_group_msg'] = False
            # Личное — рассылаем двум пользователям
            parts = chat.room_key.replace('chat_', '').split('_')
            for uid_str in parts:
                if uid_str.isdigit():
                    uid_int = int(uid_str)
                    _chat_cache.delete(uid_int)
                    emit('new_message', payload, room=f'user_{uid_str}')
                    # Push получателю если он не онлайн
                    if uid_int != current_user.id:
                        is_online = _online_cache.get(uid_int)
                        if not is_online:
                            eventlet.spawn(send_push_to_user,
                                uid_int,
                                sender_name,
                                push_preview,
                                chat_id)


@socketio.on('mark_read')
def handle_mark_read(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return
    result = db.session.execute(
        text('UPDATE message SET is_read=TRUE WHERE chat_id=:cid AND is_read=FALSE AND sender_id!=:uid AND is_deleted=FALSE'),
        {'cid': chat_id, 'uid': current_user.id}
    )
    db.session.commit()
    _chat_cache.delete(current_user.id)

    if result.rowcount > 0:
        chat = db.session.get(Chat, chat_id)
        if chat and not chat.room_key.startswith('group_'):
            p_id = get_partner_id(chat, current_user.id)
            if p_id:
                emit('messages_read_bulk', {'chat_id': chat_id}, room=f'user_{p_id}')


@socketio.on('react_message')
def handle_reaction(data):
    if not current_user.is_authenticated:
        return
    msg_id  = data.get('msg_id')
    emoji   = data.get('emoji', '')[:10]
    chat_id = data.get('chat_id')
    if not all([msg_id, emoji, chat_id]):
        return

    existing = MessageReaction.query.filter_by(msg_id=msg_id, user_id=current_user.id, emoji=emoji).first()
    if existing:
        db.session.delete(existing)
    else:
        db.session.add(MessageReaction(msg_id=msg_id, user_id=current_user.id, emoji=emoji))
    db.session.commit()

    reaction_payload = {'msg_id': msg_id, 'emoji': emoji, 'user_id': current_user.id}
    chat = db.session.get(Chat, chat_id)
    if chat:
        if chat.room_key.startswith('group_'):
            emit('message_reaction', reaction_payload, room=f'chat_{chat_id}')
        else:
            parts = chat.room_key.replace('chat_', '').split('_')
            for uid_str in parts:
                if uid_str.isdigit():
                    emit('message_reaction', reaction_payload, room=f'user_{uid_str}')


@socketio.on('delete_message')
def handle_delete_message(data):
    if not current_user.is_authenticated:
        return
    msg_id  = data.get('msg_id')
    chat_id = data.get('chat_id')
    if not msg_id or not chat_id:
        return

    msg = db.session.get(Message, msg_id)
    if not msg or msg.sender_id != current_user.id:
        return

    msg.is_deleted = True
    msg.content    = None
    db.session.commit()
    _chat_cache.invalidate_prefix(str(chat_id))

    del_payload = {'msg_id': msg_id, 'chat_id': chat_id}
    chat = db.session.get(Chat, chat_id)
    if chat:
        if chat.room_key.startswith('group_'):
            emit('message_deleted', del_payload, room=f'chat_{chat_id}')
        else:
            parts = chat.room_key.replace('chat_', '').split('_')
            for uid_str in parts:
                if uid_str.isdigit():
                    emit('message_deleted', del_payload, room=f'user_{uid_str}')


def _get_partner_id_sio(chat_id):
    chat = db.session.get(Chat, chat_id)
    if not chat:
        return None
    parts = chat.room_key.replace('chat_', '').split('_')
    return next((p for p in parts if p.isdigit() and int(p) != current_user.id), None)


@socketio.on('typing')
def handle_typing(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return

    chat = db.session.get(Chat, chat_id)
    if not chat:
        return

    typing_payload = {
        'chat_id':   chat_id,
        'user_id':   current_user.id,
        'user_name': current_user.name
    }

    if chat.room_key.startswith('group_'):
        # В группе — всем кроме себя
        emit('is_typing', typing_payload, room=f'chat_{chat_id}', skip_sid=request.sid if hasattr(request, 'sid') else None)
    else:
        p_id = _get_partner_id_sio(chat_id)
        if p_id:
            emit('is_typing', typing_payload, room=f'user_{p_id}')


@socketio.on('stop_typing')
def handle_stop_typing(data):
    if not current_user.is_authenticated:
        return
    chat_id = data.get('chat_id')
    if not chat_id:
        return

    chat = db.session.get(Chat, chat_id)
    if not chat:
        return

    if chat.room_key.startswith('group_'):
        emit('stop_typing', {'chat_id': chat_id}, room=f'chat_{chat_id}')
    else:
        p_id = _get_partner_id_sio(chat_id)
        if p_id:
            emit('stop_typing', {'chat_id': chat_id}, room=f'user_{p_id}')


@socketio.on('call_user')
def handle_call(data):
    if not current_user.is_authenticated:
        return
    to = data.get('to')
    if not to:
        return
    emit('incoming_call', {
        'from':        current_user.id,
        'from_name':   current_user.name,
        'from_avatar': current_user.avatar,
        'offer':       data.get('offer'),
        'call_type':   data.get('call_type', 'audio'),
        'type':        data.get('type', 'audio'),
    }, room=f'user_{to}')


@socketio.on('answer_call')
def handle_answer(data):
    if not current_user.is_authenticated:
        return
    to = data.get('to')
    if not to:
        return
    emit('call_answered', {'from': current_user.id, 'answer': data.get('answer')}, room=f'user_{to}')


@socketio.on('ice_candidate')
def handle_ice(data):
    if not current_user.is_authenticated:
        return
    to = data.get('to')
    if not to:
        return
    emit('ice_candidate', {'from': current_user.id, 'candidate': data.get('candidate')}, room=f'user_{to}')


@socketio.on('end_call')
def handle_end_call(data):
    if not current_user.is_authenticated:
        return
    to = data.get('to')
    if to:
        emit('call_ended', {'from': current_user.id}, room=f'user_{to}')


# ══════════════════════════════════════════════════════════
#  ФОНОВАЯ ОЧИСТКА
# ══════════════════════════════════════════════════════════
def background_cleanup():
    while True:
        eventlet.sleep(300)
        try:
            with app.app_context():
                expired = Moment.query.filter(Moment.expires_at < datetime.utcnow()).all()
                for m in expired:
                    if m.media_url:
                        path = os.path.join(BASE_DIR, m.media_url.lstrip('/'))
                        if os.path.exists(path):
                            try:
                                os.remove(path)
                            except Exception:
                                pass
                    db.session.delete(m)
                if expired:
                    db.session.commit()
                    _moments_cache.delete('all')

                stale = User.query.filter(
                    User.is_online == True,
                    User.last_seen < datetime.utcnow() - timedelta(minutes=10)
                ).all()
                for u in stale:
                    u.is_online = False
                    _online_cache.delete(u.id)
                if stale:
                    db.session.commit()
        except Exception as e:
            app.logger.error(f'Cleanup error: {e}')


def optimize_sqlite():
    print('✅ PostgreSQL — оптимизация не нужна')


# ══════════════════════════════════════════════════════════
#  МИГРАЦИИ
# ══════════════════════════════════════════════════════════
def run_migrations():
    # Создаём таблицу просмотров моментов
    try:
        with db.engine.connect() as conn:
            conn.execute(text('''CREATE TABLE IF NOT EXISTS moment_view (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                moment_id INTEGER NOT NULL REFERENCES moment(id),
                viewer_id INTEGER NOT NULL REFERENCES user(id),
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(moment_id, viewer_id)
            )'''))
            conn.commit()
    except Exception as e:
        app.logger.warning(f'moment_view migration: {e}')
    # Обновляем NULL password_hash
    try:
        with db.engine.connect() as conn:
            conn.execute(text(
                "UPDATE \"user\" SET password_hash=:ph WHERE password_hash IS NULL OR password_hash=''"
            ), {'ph': generate_password_hash('__passwordless__')})
            conn.commit()
    except Exception as e:
        app.logger.warning(f'password_hash migration: {e}')


# ══════════════════════════════════════════════════════════
#  HEALTHCHECK
# ══════════════════════════════════════════════════════════
@app.route('/health')
def healthcheck():
    try:
        db.session.execute(text('SELECT 1'))
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({
        'status':  'ok' if db_ok else 'degraded',
        'db':      'ok' if db_ok else 'error',
        'version': '7.0.0',
        'time_msk': to_moscow_str(datetime.utcnow()),
    }), 200 if db_ok else 503


# ══════════════════════════════════════════════════════════
#  ERROR HANDLERS
# ══════════════════════════════════════════════════════════
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/') or 'application/json' in request.headers.get('Accept', ''):
        return jsonify({'error': 'Not found'}), 404
    return redirect(url_for('index'))


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'Файл слишком большой (макс 100 МБ)'}), 413


@app.errorhandler(500)
def server_error(e):
    app.logger.error(f'500: {e}')
    try:
        db.session.rollback()
    except Exception:
        pass
    return jsonify({'error': 'Внутренняя ошибка'}), 500


# ══════════════════════════════════════════════════════════
#  ЗАПУСК
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    with app.app_context():
        os.makedirs(os.path.join(BASE_DIR, 'instance'), exist_ok=True)
        db.create_all()
        run_migrations()
        optimize_sqlite()

    eventlet.spawn(background_cleanup)

    print('╔══════════════════════════════════════════════════════╗')
    print('║         WAYCHAT SERVER v7.0.0 — STARTING            ║')
    print('╚══════════════════════════════════════════════════════╝')
    print('🚀  http://localhost:5000')
    print('🔌  Socket.IO: ws://localhost:5000/socket.io')
    print('❤️   Health:    http://localhost:5000/health')
    print('───────────────────────────────────────────────────────')
    print('📊  Ёмкость:')
    print('    Flask dev:              ~50 одновременных')
    print('    Gunicorn + eventlet:    ~1000–5000')
    print('    + Redis pub/sub:        ~10 000+')
    print('───────────────────────────────────────────────────────')
    print('✅  Новое в v7.0:')
    print('    👥 Групповые чаты')
    print('    ⚡ Кэш сообщений на фронте')
    print('    🔧 Исправлена регистрация')
    print('    📩 35 сообщений за раз (cursor pagination)')
    print('    🎨 SVG иконки вместо эмодзи')
    print('───────────────────────────────────────────────────────')

    port = int(os.environ.get('PORT', 5000))

    socketio.run(
        app,
        host         = '0.0.0.0',
        port         = port,
        debug        = False,
        allow_unsafe_werkzeug = True,
        use_reloader = False,
    )
