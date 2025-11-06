from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import URL, make_url


def get_engine() -> Engine:
    """
    Tạo kết nối SQLAlchemy tới kho dữ liệu canvas_dwh.
    Ưu tiên đọc thông tin từ biến môi trường trong `.env.local`.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()

    conn_str = os.getenv(
        "DB_CONNECTION_STRING",
        "postgresql+psycopg2://postgres:sekret@localhost:5432/canvas_dwh",
    )
    url: URL = make_url(conn_str)
    if url.host == "postgres" and os.getenv("DOCKER_CONTAINER") != "true":
        url = url.set(host="localhost")

    return create_engine(url, connect_args={"options": "-c search_path=public"})
