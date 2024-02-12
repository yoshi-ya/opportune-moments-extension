# Use the official Node.js 21 image
FROM node:21

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose port 3000 to the outside world
EXPOSE 3000

# Start the application using npm run start-dev
CMD ["npm", "run", "start-dev"]
