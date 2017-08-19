FROM iromu/weplay-common:latest

# Create app directory
RUN mkdir -p /usr/src/app/rom
RUN mkdir -p /usr/src/app/rom/data
WORKDIR /usr/src/app/rom

COPY . .

# Install app dependencies
RUN yarn --production
RUN yarn link weplay-common

# Setup environment
ENV NODE_ENV production
ENV DISCOVERY_URL "http://discovery:3010"
ENV WEPLAY_REDIS_URI "redis:6379"
ENV WEPLAY_LOGSTASH_URI "logstash:5001"

# Run
CMD [ "node", "index.js" ]
