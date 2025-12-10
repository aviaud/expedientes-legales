let userProfile = null;
let token = null;

function onSignIn(response) {
    token = response.credential;

    // Decodificar JWT del usuario
    const payload = JSON.parse(atob(token.split('.')[1]));
    userProfile = payload;

    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "block";

    gapi.load("client", initGoogleDrive);
}

function logout() {
    google.accounts.id.disableAutoSelect();
    userProfile = null;
    token = null;

    document.getElementById("login-section").style.display = "block";
    document.getElementById("app").style.display = "none";
}

