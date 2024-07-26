import Script from 'next/script'

const TelegramScript = () => {
    return <Script strategy="beforeInteractive" src="https://telegram.org/js/telegram-web-app.js" />
}

export default TelegramScript