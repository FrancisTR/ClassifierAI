# Welcome to the ClassifierAI Repository!

## Description

A Google Chrome Extension that integrates Machine Learning to determine if the image and the dev.to article, that the user is viewing, is AI-Generated. This uses Tensorflow.js to perform Image Classification and Text Classification.

The model is trained using [Teachable Machine](https://teachablemachine.withgoogle.com/) by Google where it is train from 1832 images, that consists of AI and Non-AI images, using the following settings:

- Epochs: 30
- Batch Size: 16
- Learning Rate: 0.0001

## Technologies Used

**Core Tech:** [<img alt="JavaScript" src="https://img.shields.io/badge/-JavaScript-0F172A?style=flat-square&logo=javascript&logoColor=F7DF1E" />](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[<img alt="HTML5" src="https://img.shields.io/badge/-HTML5-0F172A?style=flat-square&logo=html5&logoColor=E34F26" />](https://developer.mozilla.org/en-US/docs/Web/HTML)
[<img alt="CSS3" src="https://img.shields.io/badge/-CSS3-0F172A?style=flat-square&logo=css&logoColor=1572B6" />](https://developer.mozilla.org/en-US/docs/Web/CSS)
[<img alt="Tailwind CSS" src="https://img.shields.io/badge/-Tailwind%20CSS-0F172A?style=flat-square&logo=tailwindcss&logoColor=38BDF8" />](https://tailwindcss.com/)

**Content Analysis:** [<img alt="TensorFlow.js" src="https://img.shields.io/badge/-TensorFlow.js-0F172A?style=flat-square&logo=tensorflow&logoColor=FF6F00" />](https://www.tensorflow.org/js)
[<img alt="Chart.js" src="https://img.shields.io/badge/-Chart.js-0F172A?style=flat-square&logo=chartdotjs&logoColor=FF6384" />](https://www.chartjs.org/)

**Extension Tooling:** [<img alt="Vite" src="https://img.shields.io/badge/-Vite-0F172A?style=flat-square&logo=vite&logoColor=646CFF" />](https://vitejs.dev/)
[<img alt="CRXJS" src="https://img.shields.io/badge/-CRXJS-0F172A?style=flat-square&logo=googlechrome&logoColor=4285F4" />](https://crxjs.dev/)

## How to Run

1. Clone or download the repository and navigate to the project directory.

2. Install the project dependencies:

   ```bash
   npm install
   ```

3. Build the extension:

   ```bash
   npm run build
   ```

4. Open Google Chrome and navigate to:

   ```text
   chrome://extensions
   ```

5. Enable **Developer Mode** in the top-right corner.

6. Click **Load unpacked** and select the generated `dist/` folder.

7. The extension is now installed and ready to use.

## Demo

### Installation

1. Copy HTTPS link:

   ![Copy HTTPS](INSERT_LINK_HERE)

2. Open a terminal and clone the repo:

   ![Clone Repo](INSERT_LINK_HERE)

3. Install dependencies and run build:

   ![Dependencies and Build](INSERT_LINK_HERE)

4. Open `chrome://extensions/` and unpack `dist/`:

   ![Install extension](INSERT_LINK_HERE)

### Usage

1. Open [dev.to](https://dev.to/) and toggle ClassifierAI:

   ![Toggle ClassifierAI](INSERT_LINK_HERE)

2. Click a DEV article and see results:

   ![Results](INSERT_LINK_HERE)

## Contributing

ClassifierAI is an open-source project, and contributions of all sizes are welcome.

For contribution guidelines, development setup, and pull request workflow, please see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See [LICENSE.md](./LICENSE) for details.
