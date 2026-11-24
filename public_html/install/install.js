(function () {
  var form = document.querySelector("form[data-continue='1']");
  if (!form) return;
  var button = form.querySelector("button");
  if (button) button.textContent = "กำลังนำเข้า…";
  window.setTimeout(function () {
    form.submit();
  }, 400);
})();
