FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=5173
ENV DB_PATH=/app/data/liukanshan_p0.sqlite
ENV CONFIG_PATH=/app/config/config.json
ENV AUTH_MODE=mock
ENV LOCAL_AUTH_BYPASS=false

WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/data /app/config /app/db/sqlite \
    && chown -R appuser:appuser /app

COPY --chown=appuser:appuser db/sqlite/init_p0.sql /app/db/sqlite/init_p0.sql
COPY --chown=appuser:appuser p0_mock /app/p0_mock
COPY --chown=appuser:appuser 3d-liukanshan-roaming /app/3d-liukanshan-roaming

USER appuser

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:5173/', timeout=3).close()"

CMD ["python", "p0_mock/server.py"]
