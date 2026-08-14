FROM node:20-alpine

WORKDIR /root/task

COPY package.json ./
RUN npm install --silent

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
