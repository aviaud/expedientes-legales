let db;

// Inicializar Base de Datos
function initDB() {
    let request = indexedDB.open("expedientes_legales", 1);

    request.onupgradeneeded = function(event) {
        db = event.target.result;

        db.createObjectStore("clientes", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("expedientes", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("documentos", { keyPath: "id", autoIncrement: true });
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        cargarClientes();
        cargarExpedientes();
        cargarDocumentos();
    };
}

// Cambiar entre secciones
function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

/* ---------------------------
   CLIENTES
----------------------------*/

function agregarCliente() {
    let nombre = prompt("Nombre del cliente:");
    if (!nombre) return;

    let trans = db.transaction("clientes", "readwrite");
    let store = trans.objectStore("clientes");

    store.add({ nombre });

    trans.oncomplete = cargarClientes;
}

function cargarClientes() {
    let store = db.transaction("clientes", "readonly").objectStore("clientes");
    let lista = document.getElementById("listaClientes");

    lista.innerHTML = "";

    store.openCursor().onsuccess = function(e) {
        let cursor = e.target.result;
        if (cursor) {
            let c = cursor.value;
            lista.innerHTML += `
                <div class="card">
                    <b>${c.nombre}</b>
                    <button onclick="eliminarCliente(${c.id})">Eliminar</button>
                </div>`;
            cursor.continue();
        }
    };
}

function buscarClientes(texto) {
    texto = texto.toLowerCase();
    let cards = document.querySelectorAll("#listaClientes .card");

    cards.forEach(card => {
        let visible = card.textContent.toLowerCase().includes(texto);
        card.style.display = visible ? "block" : "none";
    });
}

function eliminarCliente(id) {
    let trans = db.transaction("clientes", "readwrite");
    trans.objectStore("clientes").delete(id);
    trans.oncomplete = cargarClientes;
}

/* ---------------------------
   EXPEDIENTES
----------------------------*/

function agregarExpediente() {
    let titulo = prompt("Título del expediente:");
    if (!titulo) return;

    let trans = db.transaction("expedientes", "readwrite");
    trans.objectStore("expedientes").add({ titulo, fecha: new Date().toISOString() });

    trans.oncomplete = cargarExpedientes;
}

function cargarExpedientes() {
    let store = db.transaction("expedientes", "readonly").objectStore("expedientes");
    let lista = document.getElementById("listaExpedientes");

    lista.innerHTML = "";

    store.openCursor().onsuccess = function(e) {
        let cursor = e.target.result;
        if (cursor) {
            let x = cursor.value;
            lista.innerHTML += `
                <div class="card">
                    <b>${x.titulo}</b> — ${x.fecha}
                    <button onclick="eliminarExpediente(${x.id})">Eliminar</button>
                </div>`;
            cursor.continue();
        }
    };
}

function eliminarExpediente(id) {
    let trans = db.transaction("expedientes", "readwrite");
    trans.objectStore("expedientes").delete(id);
    trans.oncomplete = cargarExpedientes;
}

/* ---------------------------
   DOCUMENTOS
----------------------------*/

function agregarDocumento() {
    let nombre = prompt("Nombre del documento:");
    if (!nombre) return;

    let trans = db.transaction("documentos", "readwrite");
    trans.objectStore("documentos").add({ nombre, fecha: new Date().toISOString() });

    trans.oncomplete = cargarDocumentos;
}

function cargarDocumentos() {
    let store = db.transaction("documentos", "readonly").objectStore("documentos");
    let lista = document.getElementById("listaDocumentos");

    lista.innerHTML = "";

    store.openCursor().onsuccess = function(e) {
        let cursor = e.target.result;
        if (cursor) {
            let d = cursor.value;
            lista.innerHTML += `
                <div class="card">
                    <b>${d.nombre}</b> — ${d.fecha}
                    <button onclick="eliminarDocumento(${d.id})">Eliminar</button>
                </div>`;
            cursor.continue();
        }
    };
}

function eliminarDocumento(id) {
    let trans = db.transaction("documentos", "readwrite");
    trans.objectStore("documentos").delete(id);
    trans.oncomplete = cargarDocumentos;
}

/* ---------------------------
   BACKUP
----------------------------*/

function exportarBackup() {
    let backup = {
        clientes: [],
        expedientes: [],
        documentos: []
    };

    let trans = db.transaction(["clientes","expedientes","documentos"], "readonly");

    trans.objectStore("clientes").getAll().onsuccess = e => backup.clientes = e.target.result;
    trans.objectStore("expedientes").getAll().onsuccess = e => backup.expedientes = e.target.result;
    trans.objectStore("documentos").getAll().onsuccess = e => backup.documentos = e.target.result;

    trans.oncomplete = () => {
        let blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
        let url = URL.createObjectURL(blob);

        let a = document.createElement("a");
        a.href = url;
        a.download = "backup_expedientes.json";
        a.click();
    };
}

function importarBackup(event) {
    let file = event.target.files[0];
    let reader = new FileReader();

    reader.onload = function() {
        let data = JSON.parse(reader.result);

        let trans = db.transaction(["clientes","expedientes","documentos"], "readwrite");
        trans.objectStore("clientes").clear();
        trans.objectStore("expedientes").clear();
        trans.objectStore("documentos").clear();

        data.clientes.forEach(c => trans.objectStore("clientes").add(c));
        data.expedientes.forEach(x => trans.objectStore("expedientes").add(x));
        data.documentos.forEach(d => trans.objectStore("documentos").add(d));

        trans.oncomplete = () => {
            alert("Backup restaurado");
            cargarClientes();
            cargarExpedientes();
            cargarDocumentos();
        };
    };

    reader.readAsText(file);
}
