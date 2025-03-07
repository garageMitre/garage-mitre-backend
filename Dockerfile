# Usa una imagen de Node.js basada en Debian (necesaria para instalar cups)
FROM node:18

# Instala cups y herramientas de impresión
RUN apt-get update && apt-get install -y cups cups-bsd

# Crea un directorio de trabajo en el contenedor
WORKDIR /app

# Copia los archivos del proyecto
COPY package*.json ./
COPY tsconfig.json ./
COPY . .

# Instala las dependencias
RUN npm install

# Compila el código TypeScript
RUN npm run build

# Expone el puerto en el que corre la app (Railway lo detecta automáticamente)
EXPOSE 3000

# Comando para ejecutar la app en Railway
CMD ["npm", "run", "start"]
