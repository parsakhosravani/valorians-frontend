import Script from 'next/script'

const GoogleScript = () => {
    return (
        <>
            <Script id='google-script' strategy="beforeInteractive" async src={`https://www.googletagmanager.com/gtag/js?id=${process?.env?.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}`}></Script>
            <Script id='google-code' strategy="beforeInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${process?.env?.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}');
                `}
            </Script>
        </>
    )
}

export default GoogleScript