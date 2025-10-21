const epId = localStorage.getItem("episodeId");
const epTitle = localStorage.getItem("episodeTitle");
document.getElementById("episodeTitle").innerText = `Assistindo: ${epTitle}`;
const iframe = document.getElementById("iframePlayer");
iframe.src = `https://hianime.to/watch/${epId}`;
