echo "run server"

cd "/home/wuji/trip/server"

npm run start:prod
# node server.js

echo "run nginx"
cd "/home/wuji/trip/deploy"
nginx -g 'daemon off;'