const fs = require('fs');
const path = require('path');

// Create models directory in client/public
const modelsDir = path.join(__dirname, 'client', 'public', 'models');

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log('Created models directory:', modelsDir);
  
  // Create a README file with instructions
  const readmeContent = `# Face Recognition Models

This directory should contain the face-api.js model files for face recognition functionality.

## Required Files

Download the following files from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

1. tiny_face_detector_model-weights_manifest.json
2. tiny_face_detector_model-shard1
3. face_landmark_68_model-weights_manifest.json
4. face_landmark_68_model-shard1
5. face_recognition_model-weights_manifest.json
6. face_recognition_model-shard1
7. face_recognition_model-shard2
8. face_expression_model-weights_manifest.json
9. face_expression_model-shard1

## Installation

1. Download all the files listed above
2. Place them in this directory (client/public/models/)
3. The face recognition feature will work automatically

## Note

These models are required for the face recognition functionality to work properly.
Without these models, students will not be able to register their faces or use face recognition for attendance marking.
`;

  fs.writeFileSync(path.join(modelsDir, 'README.md'), readmeContent);
  console.log('Created README.md with model setup instructions');
} else {
  console.log('Models directory already exists:', modelsDir);
}

console.log('\nFace recognition models setup complete!');
console.log('Please download the required model files and place them in:', modelsDir);
