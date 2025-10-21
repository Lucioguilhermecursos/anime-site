document.getElementById("openSlug").addEventListener("click", () => {
  const slug = document.getElementById("slugInput").value.trim();
  if (!slug) return alert("Digite um slug válido, ex: bleach-806");
  localStorage.setItem("animeSlug", slug);
  localStorage.setItem("animeTitle", slug.replace(/-/g, ' '));
  window.location.href = "detalhes.html";
});
