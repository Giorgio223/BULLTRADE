let __disconnecting = false;

async function disconnectTonWallet(){
  if(__disconnecting) return;
  __disconnecting = true;

  try{
    try {
      if (window.__tonUI && typeof window.__tonUI.disconnect === "function") {
        await window.__tonUI.disconnect();
      }
    } catch(e){}

    // очистка локального состояния
    localStorage.removeItem(WALLET_KEY);
    setWalletUI("");

    // ВАЖНО: не вызываем /api/me вообще, потому что address нет
    await fetchServerBalance();
  } finally {
    __disconnecting = false;
  }
}
