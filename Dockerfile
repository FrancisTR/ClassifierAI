FROM node:22

WORKDIR /src

COPY package*.json ./

RUN npm install

# Copy everything
COPY . .

ENV PORT=5173

EXPOSE 5173

RUN npm run build

CMD ["npm", "run", "dev"]