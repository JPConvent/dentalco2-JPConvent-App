
function calculateCO2() {
    const electricity = parseFloat(document.querySelector('input[name="electricity"]').value);
    const diesel = parseFloat(document.querySelector('input[name="diesel"]').value);

    const co2Electricity = electricity * 0.4; // kg CO2/kWh
    const co2Diesel = diesel * 0.165; // kg CO2/km bei 6.5l/100km

    const totalCO2 = co2Electricity + co2Diesel;

    document.getElementById('result').innerText = `Gesamtemission: ${totalCO2.toFixed(2)} kg CO₂e`;
}
