let classifier = ml5.imageClassifier("MobileNet"); //Access our ml5.js for image classification

//Every img has a corresponding ID on google. We use that ID as key and the value is its parent div
//to indicate that the image needs to be scanned. Scanned images are replaced with "" string.
let imageClassified = {};

function appendImages() {
  //Give us a list of div classes that has an img in them
  let img = document.getElementsByClassName("bFtXbb CUMKHb uhHOwf BYbUcd"); //This is a specific class name google used.
  for (let i of img) {
    if (!(i.getElementsByTagName("img")[0].id in imageClassified)) {
      //If key does not exist, add it
      imageClassified[i.getElementsByTagName("img")[0].id] =
        "bFtXbb CUMKHb uhHOwf BYbUcd";
      imageClassificationScan(i.getElementsByTagName("img")[0].id);
      // console.log(i.getElementsByTagName("img")[0]);
      // console.log(i.getElementsByTagName("img")[0].id);
    }
  }
}

//WIP
function imageClassificationScan(imgID) {
  const img = new Image();
  img.src = document.getElementById(imgID).src;
  // console.log(img.src);
  classifier.classify(img, gotResult);
}

function gotResult(results) {
  console.log(results);
}

// Select the node that will be observed for mutations
const targetNode = document.getElementById("gsr"); // We see the whole HTML page on the image section on google

// Options for the observer (which mutations to observe)
const config = { attributes: true, childList: true, subtree: true };

// Callback function to execute when mutations are observed
const callback = (mutationList, observer) => {
  //WIP
  for (const mutation of mutationList) {
    if (mutation.type === "childList") {
      console.log("A child node has been added or removed.");
      appendImages();
      console.log(imageClassified);
    }
  }
};

// Create an observer instance linked to the callback function
const observer = new MutationObserver(callback);

// Start observing the target node for configured mutations
observer.observe(targetNode, config);
