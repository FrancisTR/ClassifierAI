const drop_file = document.querySelector('.scanner-images');
const header = drop_file.querySelector('header');
const span = drop_file.querySelector('span');
const button = drop_file.querySelector('button');
const input = drop_file.querySelector('input');

const scannerResult = document.getElementById("ScannerResult");
let classifier = ml5.imageClassifier("https://teachablemachine.withgoogle.com/models/veVmi7GVA/"); //Access our ml5.js for image classification

let file;


drop_file.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop_file.classList.add('active');
    header.classList.add('img');
    header.textContent = 'Release to Upload Image';
    span.classList.add('img');
    button.classList.add('background');
});

drop_file.addEventListener('dragleave', (e) => {
    drop_file.classList.remove('active');
    header.classList.remove('img');
    header.textContent = 'Drag and Drop Image';
    span.classList.remove('img');
    button.classList.remove('background');
});

drop_file.addEventListener('drop', (e) => {
    e.preventDefault();
    file = e.dataTransfer.files[0];
    
    showFile();
});

function showFile() {
    let fileType = file.type;
    let type_imgs_format = ['image/jpeg', 'image/jpg', 'image/png'];
    
    if (type_imgs_format.includes(fileType)) {
        
        let file_reader = new FileReader(); // Create new file reader object
        file_reader.onload = () => {
            let file_url = file_reader.result;
            let img_tag = `<img src="${file_url}">`;
            drop_file.innerHTML = img_tag;

            //Gives us the result of our classification (WIP)
            let result = classifier.classify(loadImage(file_url));
            result.then((results) => {
                console.log(results);
                scannerResult.textContent = `Result: ${results[0].label}`
            })
            .catch((error) => {
                console.log(error); // Handles any errors
            });
        }
        file_reader.readAsDataURL(file);
    }else{
        alert('this is incorrect img format');
        drop_file.classList.remove('active');
    }   
}

function loadImage(src) {
    var img = new Image();
    img.setAttribute("crossorigin", "anonymous");
    img.src = src;
    return img;
}

button.onclick = () => {
    input.click();
}

input.addEventListener('change', function() {
    file = this.files[0];
    showFile();
    drop_file.classList.add('active');
})