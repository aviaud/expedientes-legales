// AUTH.JS
let userEmail = null;

function handleCredentialResponse(response) {
    const data = jwt_decode(response.credential);
    userEmail = data.email;

    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");

    initDB();
}


