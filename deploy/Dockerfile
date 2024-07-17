FROM node:18 as cbuilder

ARG PROJECT_HOME=/home/wuji/trip
COPY ./packages/client/package.json ${PROJECT_HOME}/client/
WORKDIR ${PROJECT_HOME}/client
RUN npm install --legacy-peer-deps



FROM node:18 as sbuilder

ARG PROJECT_HOME=/home/wuji/trip
COPY ./packages/server/package.json ${PROJECT_HOME}/server/
WORKDIR ${PROJECT_HOME}/server
RUN npm install --legacy-peer-deps


FROM node:18

ARG PROJECT_HOME=/home/wuji/trip

# RUN sed -i s@/archive.ubuntu.com/@/mirrors.aliyun.com/@g /etc/apt/sources.list
# RUN sed -i s@/security.ubuntu.com/@/mirrors.aliyun.com/@g /etc/apt/sources.list
# RUN apt-get clean
RUN apt-get update && apt-get install -y nginx

COPY ./deploy/nginx.conf /etc/nginx/
COPY ./deploy/server.conf /etc/nginx/conf.d/


COPY ./packages/client/package.json ${PROJECT_HOME}/client/
COPY ./packages/server/package.json ${PROJECT_HOME}/server/

WORKDIR ${PROJECT_HOME}/client

COPY ./packages/client/ ${PROJECT_HOME}/client/
RUN rm -rf ./node_modules
COPY --from=cbuilder ${PROJECT_HOME}/client/node_modules ./node_modules
RUN npm run build

WORKDIR ${PROJECT_HOME}/server
COPY ./packages/server/ ${PROJECT_HOME}/server/
RUN rm -rf ./node_modules
COPY --from=sbuilder ${PROJECT_HOME}/server/node_modules ./node_modules
RUN npm run build


COPY ./deploy/entrypoint.sh ${PROJECT_HOME}/entrypoint.sh
RUN chmod +x /home/wuji/trip/entrypoint.sh
ENTRYPOINT [ "sh", "-c", "/home/wuji/trip/entrypoint.sh" ]

EXPOSE 8080

