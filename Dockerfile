FROM apache/airflow:2.8.1-python3.10

USER root
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/airflow
COPY requirements.txt /opt/airflow/requirements.txt

USER airflow
# Install base + ML/plotting deps for pipeline
RUN pip install --no-cache-dir psycopg2-binary sqlalchemy pandas python-dotenv \
    && pip install --no-cache-dir -r /opt/airflow/requirements.txt

# Identify container runtime for features/db.py hostname logic
ENV DOCKER_CONTAINER=true

# Make local features package available to Airflow tasks
COPY --chown=airflow:0 features /opt/airflow/learning_analytics/features
ENV PYTHONPATH=/opt/airflow:$PYTHONPATH
