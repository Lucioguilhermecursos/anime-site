const slug = localStorage.getItem("animeSlug");
const title = localStorage.getItem("animeTitle");
document.getElementById("animeTitle").innerText = title;

const backHome = document.getElementById("backHome");
backHome.addEventListener("click", () => window.location.href = "index.html");

async function loadEpisodes() {
  try {
    const resp = await fetch(`http://localhost:4000/api/v2/hianime/anime/${slug}/episodes`);
    const data = await resp.json();
    const container = document.getElementById("episodeList");

    if (!data || !data.data || !data.data.episodes) {
      container.innerHTML = "<p>Erro ao carregar episódios.</p>";
      return;
    }

    data.data.episodes.forEach(ep => {
      const btn = document.createElement("button");
      btn.innerText = `Episódio ${ep.number} - ${ep.title}`;
      btn.onclick = () => {
        localStorage.setItem("episodeId", ep.episodeId);
        localStorage.setItem("episodeTitle", ep.title);
        window.location.href = "player.html";
      };
      container.appendChild(btn);
    });
  } catch (e) {
    document.getElementById("episodeList").innerHTML = "<p>Erro ao carregar episódios.</p>";
  }
}
loadEpisodes();
