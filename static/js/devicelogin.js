window.addEventListener('DOMContentLoaded', event => {
  const element = document.getElementById('expiration');
  console.log(element);
  let time = parseInt(element.innerHTML);
  window.setInterval(() => {
    if (time > 0) {
      element.innerHTML = --time;
    }
  }, 1000);
});
