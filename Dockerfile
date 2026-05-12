FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=5173
ENV DB_PATH=/app/data/liukanshan_p0.sqlite
ENV CONFIG_PATH=/app/config/config.json
ENV LOCAL_AUTH_BYPASS=false
ENV TZ=Asia/Shanghai

WORKDIR /app

RUN mkdir -p /app/data /app/config /app/db/sqlite

COPY db/sqlite/init_p0.sql /app/db/sqlite/init_p0.sql
COPY p0_mock /app/p0_mock
COPY 3d-liukanshan-roaming /app/3d-liukanshan-roaming
COPY imgs /app/imgs

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:5173/api/auth/me', timeout=3).close()"

CMD ["python", "p0_mock/server.py"]
