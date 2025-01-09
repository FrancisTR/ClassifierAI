//Initialize our ml5 and dictionary to store image IDs from google
let classifier = ml5.imageClassifier("MobileNet"); //Access our ml5.js for image classification

//Every img has a corresponding ID on google. We use that ID as key and the value is its parent div
//to indicate that the image needs to be scanned. Scanned images are replaced with "" string. (WIP)
let imageClassified = {}; //Use to keep track of images on google and avoid duplicates when performing ML

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
  const config = { attributes: true, childList: true, subtree: true };

  // Start observing
  observer.observe(documentNode, config);
}



/*
  This function is the main functionality that will perform image classification for all images on google.
*/
function main() {
  console.log("Initiate Machine Learning");
  runML(); //Start


  /*
    This function gets all the image on the current page and store them in a dictionary.
    For each image, we scan to see if the Image is AI-Generated. (WIP)
  */
  function runML() {
    // Get all the div that has this specific class name.
    // bFtXbb CUMKHb uhHOwf BYbUcd - Inspect mode div class name.
    let img = document.getElementsByClassName("H8Rx8c"); //This is a specific class name google used that contains an image.

    // For each div (that contains an image), we store them in a dictionary to prevent dup scans (WIP)
    for (let i of img) {
      //If the image that we have given base on observer is new, add it
      if (!(i.getElementsByTagName("img")[0].id in imageClassified)) {
        imageClassified[i.getElementsByTagName("img")[0].id] = "H8Rx8c"; //Store it

        //Add loading.gif to indicate that the image is scanning (Never show up but just in case)
        var statusImg = document.createElement("img");
        statusImg.className = "FrancisTRStatusAI";
        statusImg.src = chrome.runtime.getURL("Images/loading.gif");
        i.appendChild(statusImg);

        imageClassificationScan(i); //Start the scan for that image to see if the image is Ai-Generated
        // console.log(i.getElementsByTagName("img")[0]);
        // console.log(i.getElementsByTagName("img")[0].id);
      }
    }
  }



  /*
    This function performs image classification to determine if the image is AI-Generated.
    This will ultimately change the status icon on the webpage to show the user if the image is AI-Generated.
    (WIP)
  */
  function imageClassificationScan(imgID) {
    //This extracts the image link from the img tag into our img Object
    const img = new Image();
    img.src = document.getElementById(
      imgID.getElementsByTagName("img")[0].id
    ).src;

    //Gives us the result of our classification in decimals (WIP)
    var result = classifier.classify(img, getResult);

    //Assign icons corresponding to its result (WIP)
    var statusImg = document.createElement("img");
    statusImg.className = "FrancisTRStatusAI";
    statusImg.src = chrome.runtime.getURL("Images/AIFree.png");
    imgID.appendChild(statusImg);
  }



  /*
    This function returns the result base classifying the image.
    This will return a percentage. (WIP)
  */
  function getResult(results) {
    return results;
  }
}
