echo "run nginx"
cd "/home/wuji/trip/deploy"
nginx -g 'daemon off;' &


echo "run server"\
cd "/home/wuji/trip/server"
nohup npm run start:prod 
# node server.js
