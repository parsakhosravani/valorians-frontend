import Image from "next/image";
import rqcode from "~/images/qr/qr-code.png";
import bg from "~/images/background/intro.webp";


export const QrCode = () => {

    return (
        <div className="px-4 text-white mx-auto overflow-hidden min-h-svh max-w-md fixed w-full flex flex-col items-center bg-[#191F27]">
            <main className="w-full flex-1 flex justify-center items-end pb-[84px]">

                <div className="w-full h-full flex justify-center items-center absolute top-0 left-0 overflow-hidden z-50">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col justify-center items-center gap-2">
                        <p className="text-primary-800 text-lg font-semibold leading-7">
                            Play on your mobile
                        </p>
                        <a href={`https://t.me/${process?.env?.NEXT_PUBLIC_BOT_ADDRESS}`}>
                            <Image
                                className="w-[167px] h-[167px] qr-gradient rounded-[16px] border"
                                src={rqcode}
                                width={167}
                                height={167}
                                alt="qr-code"
                            />
                        </a>
                        <a href={`https://t.me/${process?.env?.NEXT_PUBLIC_BOT_ADDRESS}`}>
                            <p className="text-primary-800 text-lg font-semibold leading-7">
                                @{process?.env?.NEXT_PUBLIC_BOT_ADDRESS?.toUpperCase()}
                            </p>
                        </a>
                    </div>
                </div>

                <Image
                    priority
                    src={bg}
                    alt={'qrcode'}
                    className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-[0.10]"
                />

            </main>
        </div>
    );
};

