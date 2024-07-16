FROM node:18.17.1-bullseye as node18

ARG PROJECT_HOME = /home/wuji/trip

RUN apt-get update && apt-get install -y nginx

COPY ./deploy/nginx.conf /etc/nginx/
COPY ./deploy/server.conf /etc/nginx/conf.d/


COPY ./packages/client/package.json ${PROJECT_HOME}/client
COPY ./packages/server/package.json ${PROJECT_HOME}/server

WORKDIR ${PROJECT_HOME}/client
RUN npm install

WORKDIR ${PROJECT_HOME}/server
RUN npm install

WORKDIR ${PROJECT_HOME}/client
COPY ./packages/client ${PROJECT_HOME}/client
RUN npm run build

WORKDIR ${PROJECT_HOME}/server
COPY ./packages/server ${PROJECT_HOME}/server
RUN npm run build


COPY ./deploy/entrypoint.sh ${PROJECT_HOME}/entrypoint.sh
ENTRYPOINT [ "sh", "-c", "./entrypoint.sh" ]

EXPOSE 8080

