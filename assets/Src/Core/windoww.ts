
async function captureDiv() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true });
  const video = document.createElement("video");
  
  video.addEventListener("loadedmetadata", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    video.play();
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Stop all video tracks to end screen sharing
    stream.getTracks().forEach(track => track.stop());
    
    // Download image
    const link = document.createElement("a");
    link.download = "screenshot.png";
    link.href = canvas.toDataURL();
    link.click();
  });
  
  video.srcObject = stream;
}

window.capture = captureDiv

