FROM apache/airflow:2.8.1-python3.10

USER root
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

USER airflow
RUN pip install psycopg2-binary sqlalchemy pandas python-dotenv
