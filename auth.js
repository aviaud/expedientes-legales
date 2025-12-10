function handleCredentialResponse(response) {
    const data = parseJwt(response.credential);

    localStorage.setItem("user", JSON.stringify({
        name: data.name,
        email: data.email,
        picture: data.picture
    }));

    window.location.href = "home.html";
}

window.onload = function () {
    if (window.location.pathname.includes("index.html")) {
        google.accounts.id.initialize({
            client_id: "813716685470-a4t8hcof0uipjal7kv66nam68pab4de5.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });
        google.accounts.id.renderButton(
            document.querySelector(".g_id_signin"),
            { theme: "outline", size: "large" }
        );
        return;
    }
};

function parseJwt(token) {
    return JSON.parse(atob(token.split('.')[1]));
}

// Proteger páginas internas
function checkSession() {
    let user = localStorage.getItem("user");
    if (!user) window.location.href = "index.html";
}

function logout() {
    localStorage.removeItem("user");
    window.location.href = "index.html";
}
