FROM python:3.11

# Set working directory
WORKDIR /app

# Install cron and other utilities
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . /app
RUN ls -l /app && ls -l /app/db || echo "No db dir"

# Make the cron script executable
RUN chmod +x /app/cron_release_checker.sh

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Create cron job for nightly release checking (2 AM daily)
RUN echo "0 2 * * * /app/cron_release_checker.sh" > /etc/cron.d/release-checker && \
    chmod 0644 /etc/cron.d/release-checker && \
    crontab /etc/cron.d/release-checker

# Create startup script
RUN echo '#!/bin/bash\nservice cron start\nuvicorn main:app --host 0.0.0.0 --port 8000' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 8000

# Run the startup script
CMD ["/app/start.sh"] 