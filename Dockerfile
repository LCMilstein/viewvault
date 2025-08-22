FROM python:3.11

# Set working directory
WORKDIR /app

# Install cron and other utilities
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . /app
RUN ls -l /app && ls -l /app/db || echo "No db dir"

# Make the cron scripts executable
RUN chmod +x /app/cron_release_checker.sh
RUN chmod +x /app/automated_import_checker.py

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Create cron jobs for automated tasks
RUN echo "0 2 * * * /app/cron_release_checker.sh" > /etc/cron.d/viewvault-cron && \
    echo "0 * * * * /usr/bin/python3 /app/automated_import_checker.py" >> /etc/cron.d/viewvault-cron && \
    chmod 0644 /etc/cron.d/viewvault-cron && \
    crontab /etc/cron.d/viewvault-cron

# Create startup script
RUN echo '#!/bin/bash\nservice cron start\nuvicorn main:app --host 0.0.0.0 --port 8000' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 8000

# Run the startup script
CMD ["/app/start.sh"] 