import * as tf from "@tensorflow/tfjs";

const MODEL_BASE_URL = "https://teachablemachine.withgoogle.com/models/Z7sdOoyx6/";
const MODEL_URL = `${MODEL_BASE_URL}model.json`;
const METADATA_URL = `${MODEL_BASE_URL}metadata.json`;

let modelPromise = loadModel();

async function loadModel() {
  await tf.ready();
  if (tf.setBackend) {
    try {
      await tf.setBackend("webgl");
    } catch (error) {
      console.warn("TensorFlow.js WebGL backend unavailable, using default backend.", error);
    }
  }

  const [model, metadata] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(METADATA_URL).then((response) => response.json()),
  ]);

  return { model, metadata };
}

//Every img has a corresponding ID on google. We use that ID as key and the value is its parent div
//to indicate that the image is scanned.
let imageClassified = {}; //Use to keep track of images on google and avoid duplicates when performing ML

let AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };

//Start observing the image section on google
window.onload = () => {
  // Select the node that will be observed for mutations
  const targetNode = document.getElementById("gsr"); // whole HTML page on the image section on google
  selfObserver(targetNode);
};

/*
  This function is responsible for observing the web page.
  If any changes occur on the webpage, call the main function to perform its tasks.
*/
function selfObserver(documentNode) {
  // Create an observer instance for main
  const observer = new MutationObserver(function () {
    main();
  });

  // Options for the observer (which mutations to observe)
  const config = {
    attributes: true,
    childList: true,
    subtree: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
  };

  // Start observing
  try {
    observer.observe(documentNode, config);
  } catch (error) {
    console.log("Cannot Observe.");
  }
}

function createClassifierSidebar() {
  if (document.getElementById("FrancisTRSidebarBackdrop")) return;

  const backdrop = document.createElement("div");
  backdrop.id = "FrancisTRSidebarBackdrop";
  backdrop.className = "francis-ai-sidebar-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) hideClassifierSidebar();
  });

  const sidebar = document.createElement("aside");
  sidebar.id = "FrancisClassifierSidebar";
  sidebar.className = "francis-ai-sidebar";
  sidebar.innerHTML = `
    <div class="francis-ai-sidebar-header">
      <h2>ClassifierAI</h2>
      <button id="FrancisTRSidebarClose" class="francis-ai-sidebar-close" type="button" aria-label="Close sidebar">×</button>
    </div>
    <p class="francis-ai-sidebar-copy">What is the image being Classified as?</p>
    <div class="francis-ai-option">
      <input type="radio" id="FrancisTROptionAI" name="FrancifierOption" disabled />
      <label for="FrancisTROptionAI">AI</label>
    </div>
    <div class="francis-ai-option">
      <input type="radio" id="FrancisTROptionNotAI" name="FrancifierOption" disabled />
      <label for="FrancisTROptionNotAI">Not AI</label>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(sidebar);

  const closeBtn = document.getElementById("FrancisTRSidebarClose");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideClassifierSidebar();
    });
  }
}

function showClassifierSidebar() {
  createClassifierSidebar();
  const backdrop = document.getElementById("FrancisTRSidebarBackdrop");
  const sidebar = document.getElementById("FrancisClassifierSidebar");
  document.body.classList.add("francis-ai-sidebar-open");
  if (backdrop) backdrop.classList.add("visible");
  if (sidebar) sidebar.classList.add("visible");
}

function hideClassifierSidebar() {
  const backdrop = document.getElementById("FrancisTRSidebarBackdrop");
  const sidebar = document.getElementById("FrancisClassifierSidebar");
  document.body.classList.remove("francis-ai-sidebar-open");
  if (backdrop) backdrop.classList.remove("visible");
  if (sidebar) sidebar.classList.remove("visible");
}

/*
  This function is the main functionality that will perform image classification for 
  all images on google.
*/
function main() {
  // console.log("Initiate Machine Learning");
  chrome.storage.local.get("switchStatus", function (data) {
    if (data.switchStatus === true) {
      runML(); //Start
    } else {
      //reset
      AIData = { NotAI: 0, AINeutral: 0, AIGenerated: 0, TotalScan: 0 };
      chrome.storage.local.set({ AIDataCollected: AIData });
    }
  });
  imageObtain();

  /*
    This function gets all the image on the current page and store them in a dictionary.
    For each image, we scan to see if the Image is AI-Generated.
  */
  function runML() {
    // Get all the div that has this specific class name.
    // bFtXbb CUMKHb uhHOwf BYbUcd -dev mode
    // H8Rx8c -normal mode

    //WIP
    // p7sI2 PUxBg -img preview (User click on image to see the img bigger)
    // fR600b islir -img suggestion (under img preview)

    // h11UTe add in detail button
    let img = document.querySelectorAll(
      ".bFtXbb.CUMKHb.uhHOwf.BYbUcd, .H8Rx8c",
    ); //This is a specific class name google used that contains an image.

    // For each div (that contains an image), we store them in a dictionary to prevent dup scans
    for (let i of img) {
      //If the image that we have given base on observer is new, add it
      if (!(i.getElementsByTagName("img")[0].id in imageClassified)) {
        imageClassified[i.getElementsByTagName("img")[0].id] =
          i.getElementsByTagName("img")[0].src; //Store it

        iconAssigned(null, i); //Loading icon
        imageClassificationScan(i); //Start the scan for that image to see if the image is Ai-Generated
        // console.log(i.getElementsByTagName("img")[0]); //Img tag
        // console.log(i.getElementsByTagName("img")[0].id); //Img id=???
      }
    }
  }

  /*
    This function performs image classification to determine if the image is AI-Generated.
    This will ultimately change the status icon on the webpage to show the user if the image is AI-Generated.
  */
  async function imageClassificationScan(imgObj) {
    //This extracts the image link from the img tag into our img Object
    const img = loadImage(imgObj.getElementsByTagName("img")[0].src);

    try {
      await waitForImageLoad(img);
      const results = await classifyImage(img);
      iconAssigned(results, imgObj);
    } catch (error) {
      console.log("Image classification failed", error);
      iconAssigned(null, imgObj);
    }
  }

  /*
    This helper function loads the image by config the crossorgin and assigning it to the img tag.
    This is needed to process all images on google. 
  */
  function loadImage(src) {
    const img = new Image();
    img.setAttribute("crossorigin", "anonymous");
    img.src = src;
    return img;
  }

  function waitForImageLoad(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
      } else {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      }
    });
  }

  async function classifyImage(imageElement) {
    const { model, metadata } = await modelPromise;
    const imageSize = metadata.imageSize || 224;
    const labels = metadata.labels || [];

    const tensor = tf.browser
      .fromPixels(imageElement)
      .resizeBilinear([imageSize, imageSize])
      .toFloat()
      .div(tf.scalar(255))
      .expandDims();

    let prediction = model.predict(tensor);
    if (Array.isArray(prediction)) {
      prediction = prediction[0];
    }

    const scores = prediction.dataSync ? prediction.dataSync() : await prediction.data();
    tf.dispose([tensor, prediction]);

    const results = Array.from(scores).map((confidence, index) => ({
      label: labels[index] || `Class ${index}`,
      confidence,
    }));

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /*
    This function assign icons to the image base on the confidence rate. (WIP)
    NOTE: If the confidence rate is less than 60 percent whether it is AI or not, then it is AI Neutral
  */
  function iconAssigned(results, imgObj) {
    // Create the img tag for our status icon
    var statusImg = document.createElement("img");
    statusImg.setAttribute("id", "FrancisTRStatusAI");

    // Get our data and assign the icon (WIP)
    try {
      let result = [results[0].label, results[0].confidence * 100]; //Clean up data.
      // console.log(result);
      AIData["TotalScan"] += 1;

      if ((result[0] === "AI" || result[0] === "NotAI") && result[1] <= 60.0) {
        statusImg.src = chrome.runtime.getURL("Images/AINeutral.png");
        AIData["AINeutral"] += 1;
      } else if (result[0] === "AI" && result[1] > 60.0) {
        statusImg.src = chrome.runtime.getURL("Images/AIGenerated.png");
        AIData["AIGenerated"] += 1;
      } else if (result[0] === "NotAI" && result[1] > 60.0) {
        statusImg.src = chrome.runtime.getURL("Images/AIFree.png");
        AIData["NotAI"] += 1;
      }
      chrome.storage.local.set({ AIDataCollected: AIData }); //Save data to display in main.html
    } catch (error) {
      statusImg.src = chrome.runtime.getURL("Images/loading.gif"); // This is the case if results is null.
    }

    imgObj.appendChild(statusImg);
  }

  /*
    This function allows the user to get the image they click on. (WIP)
  */
  function imageObtain() {
    let detailButton = document.getElementsByClassName("h11UTe");
    // console.log(detailButton);

    // If the button does not exist, add it.
    if (
      detailButton[0] !== undefined &&
      detailButton[0].querySelector("a[id='FrancisTRCustomImageDetail']") ===
        null
    ) {
      let imgLink = document
        .getElementsByClassName("YsLeY")[0]
        .querySelector("img[class='sFlh5c FyHeAf']");
      detailButton[0].innerHTML += `
    <a
    data-ved="0CBgQ3YkBahcKEwjQ6L63--uKAxUAAAAAHQAAAAAQBA"
    rel="noopener"
    target="_blank"
    href="${imgLink.src}"
    jsaction="focus:trigger.HTIQtd;mousedown:trigger.HTIQtd;touchstart:trigger.HTIQtd;;"
    class="umNKYc"
    id="FrancisTRCustomImageDetail"
  >
    <div class="MjJqGe ibX8Cd PMUcxf re5Hve cd29Sd kM7Sgc">
      <span class="iLgTbf PMUcxf cS4Vcb-pGL6qe-lfQAOe">Get Image</span>
      <svg viewBox="0 0 24 24" focusable="false" height="18" width="18">
        <path d="M0 0h24v24H0z" fill="none"></path>
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path>
      </svg>
    </div>
  </a>
  <a
    href="#"
    role="button"
    class="umNKYc"
    id="FrancisTRCustomImageClassify"
  >
    <div class="MjJqGe ibX8Cd PMUcxf re5Hve cd29Sd kM7Sgc">
      <span class="iLgTbf PMUcxf cS4Vcb-pGL6qe-lfQAOe">Classify</span>
      <svg viewBox="0 0 24 24" focusable="false" height="18" width="18">
        <path d="M0 0h24v24H0z" fill="none"></path>
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path>
      </svg>
    </div>
  </a>
    `;

      const classifyButton = detailButton[0].querySelector(
        "#FrancisTRCustomImageClassify",
      );
      if (classifyButton) {
        classifyButton.onclick = function (event) {
          event.preventDefault();
          showClassifierSidebar();
        };
      }
    }
  }
}
