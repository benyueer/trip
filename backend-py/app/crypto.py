import hashlib
import os

def hash_password(password: str) -> str:
    """使用 PBKDF2-HMAC-SHA256 对密码进行加盐哈希，迭代 100,000 次"""
    salt = os.urandom(16).hex()
    pbkdf = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}${pbkdf.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """验证明文密码是否与存储的哈希密码相匹配"""
    if not hashed or "$" not in hashed:
        return False
    try:
        salt, hash_val = hashed.split("$", 1)
        pbkdf = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return pbkdf.hex() == hash_val
    except Exception:
        return False
