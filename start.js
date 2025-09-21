const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Smart Attendance System...\n');

// Function to run a command
function runCommand(command, args, cwd, name) {
  return new Promise((resolve, reject) => {
    console.log(`📦 ${name}...`);
    
    const process = spawn(command, args, {
      cwd: cwd,
      stdio: 'inherit',
      shell: true
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${name} completed successfully\n`);
        resolve();
      } else {
        console.log(`❌ ${name} failed with code ${code}\n`);
        reject(new Error(`${name} failed`));
      }
    });

    process.on('error', (error) => {
      console.log(`❌ Error running ${name}:`, error.message);
      reject(error);
    });
  });
}

async function start() {
  try {
    // Check if .env file exists
    const fs = require('fs');
    if (!fs.existsSync('.env')) {
      console.log('📝 Creating .env file from template...');
      fs.copyFileSync('env.example', '.env');
      console.log('✅ .env file created. Please update it with your configuration.\n');
    }

    // Setup face recognition models
    console.log('🤖 Setting up face recognition models...');
    require('./setup-models.js');
    console.log('');

    // Install backend dependencies
    await runCommand('npm', ['install'], __dirname, 'Installing backend dependencies');

    // Install frontend dependencies
    await runCommand('npm', ['install', '--legacy-peer-deps'], path.join(__dirname, 'client'), 'Installing frontend dependencies');

    console.log('🎉 Setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Update the .env file with your MongoDB URI and JWT secret');
    console.log('2. Download face recognition models and place them in client/public/models/');
    console.log('3. Start MongoDB if not already running');
    console.log('4. Run the following commands to start the application:');
    console.log('   Backend:  npm run dev');
    console.log('   Frontend: cd client && npm start');
    console.log('\n🌐 Access the application at:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Backend:  http://localhost:5000');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

start();
