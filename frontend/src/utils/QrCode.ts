import { AuthManager } from './AuthManager';

// Get QrCode from backend and display it
export function displayQRCode(qrCodeData: any) {
    const qrDiv = document.getElementById('qrcode-display');
    if (!qrDiv) { console.error("'qrcode-display' element can't be found"); return;}

    // Handle both string (direct URL) and object with qrCodeImageUrl property
    const imgUrl = typeof qrCodeData === 'string' ? qrCodeData : qrCodeData?.qrCodeImageUrl;
    if (typeof imgUrl !== 'string' || !imgUrl.startsWith('data:image/png')) {
        console.error("Data recevied is not a valid Data Url:", qrCodeData);
        AuthManager.showMessage("Error: can not display QrCode.", "error");
        return ;
    }

    const qrImg = document.createElement('img');  // Creat Img
    qrImg.src = imgUrl;  // Assign img
    qrImg.alt = "Scan qrCode for authorize 2FA";
    qrImg.className = "mx-auto rounded-lg border-2 border-white bg-white p-2";

    qrDiv.innerHTML = '';  // clear the div and display the qrCode
    qrDiv.appendChild(qrImg);
}
