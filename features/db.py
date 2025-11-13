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

    Sửa lỗi: trong container Airflow, file env được mount tại `/opt/airflow/.env.local`
    chứ không nằm cạnh mã nguồn. Đồng thời, mặc định sử dụng hostname `postgres`
    (dịch vụ Postgres trong docker-compose) thay vì `localhost` để tránh lỗi
    connection refused khi chạy trong container.
    """
    # Try loading env from both project root and Airflow mount location
    env_candidates = [
        Path(__file__).resolve().parents[1] / ".env.local",
        Path("/opt/airflow/.env.local"),
    ]
    loaded_any = False
    for p in env_candidates:
        if p.exists():
            load_dotenv(p, override=False)
            loaded_any = True
    if not loaded_any:
        # Fall back to default `.env` resolution if nothing matched
        load_dotenv()

    # Prefer explicit DB_CONNECTION_STRING, then DATABASE_URL, else sensible default
    conn_str = (
        os.getenv("DB_CONNECTION_STRING")
        or os.getenv("DATABASE_URL")
        or "postgresql+psycopg2://postgres:sekret@postgres:5432/canvas_dwh"
    )

    url: URL = make_url(conn_str)

    # If running OUTSIDE container with a docker hostname, map to localhost
    in_container = (
        os.getenv("DOCKER_CONTAINER") == "true"
        or bool(os.getenv("AIRFLOW_HOME"))
        or Path("/.dockerenv").exists()
    )
    if url.host in {"postgres", "canvas-postgres"} and not in_container:
        url = url.set(host="localhost")

    return create_engine(url, connect_args={"options": "-c search_path=public"})
