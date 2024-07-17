import { Card } from "@nextui-org/card";
import Image from "next/image";
export default function Home() {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-4">
      <Card isBlurred>
        <Image
          width={472}
          height={824}
          src="/background.svg"
          alt="background"
        />
      </Card>
    </section>
  );
}
