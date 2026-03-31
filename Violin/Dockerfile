FROM python:3.13-slim

WORKDIR /app

RUN pip install --no-cache-dir requests

COPY scripts/ /app/scripts/
COPY references/ /app/references/
RUN mkdir -p /app/data

EXPOSE 8090

ENV PYTHONUNBUFFERED=1
ENV DOCKER=1

CMD ["python", "scripts/server.py", "--port", "8090", "--host", "0.0.0.0"]
