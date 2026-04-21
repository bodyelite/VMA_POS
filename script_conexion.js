async function cargarDatosDesdeServidor() {
    try {
        const resClientes = await fetch('http://localhost:3000/api/clientes');
        window.clientesBBDD = await resClientes.json();

        const resVendedores = await fetch('http://localhost:3000/api/vendedores');
        window.vendedoresBBDD = await resVendedores.json();

        const resPrecios = await fetch('http://localhost:3000/api/precios');
        window.preciosBBDD = await resPrecios.json();

    } catch (error) {
        console.error(error);
    }
}
window.addEventListener('DOMContentLoaded', cargarDatosDesdeServidor);
