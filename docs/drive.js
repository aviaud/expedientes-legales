const CLIENT_ID = "TU_CLIENT_ID.apps.googleusercontent.com";
const API_KEY = "TU_API_KEY";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

async function initGoogleDrive() {
    await gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        scope: SCOPES,
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });

    listarArchivos();
}

async function listarArchivos() {
    const resp = await gapi.client.drive.files.list({
        pageSize: 20,
        fields: "files(id, name, mimeType)"
    });

    const lista = document.getElementById("lista");
    lista.innerHTML = "";

    resp.result.files.forEach(f => {
        const li = document.createElement("li");
        li.textContent = `${f.name} (${f.mimeType})`;
        lista.appendChild(li);
    });
}

async function crearCarpeta() {
    const folder = {
        name: "Expedientes",
        mimeType: "application/vnd.google-apps.folder"
    };

    await gapi.client.drive.files.create({
        resource: folder,
        fields: "id"
    });

    listarArchivos();
}

async function subirArchivo() {
    const fileContent = "Documento generado automáticamente"; 
    const blob = new Blob([fileContent], { type: "text/plain" });

    const metadata = {
        name: "expediente.txt",
        mimeType: "text/plain"
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);

    await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
            method: "POST",
            headers: new Headers({ "Authorization": "Bearer " + gapi.client.getToken().access_token }),
            body: form
        }
    );

    listarArchivos();
}


