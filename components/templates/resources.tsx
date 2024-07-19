import { Coin, Resource, User } from "../molecules";
import { Action, Navbar } from "../organisms";
import { Skill } from "../organisms/skill";
const resources = [
  {
    img: "./images/resources/iron.png",
    color: "bg-zinc-600",
  },
  {
    img: "./images/resources/wood.png",
    color: "bg-orange-300",
  },
  {
    img: "./images/resources/clay.png",
    color: "bg-amber-700",
  },
  {
    img: "./images/resources/crop.png",
    color: "bg-yellow-500",
  },
];
export const Resources = () => {
  return (
    <div>
      <Coin />
      <Skill />
      <Navbar />
      <Action />
      <div className="w-[244px] h-[94px] left-0 top-[14px] absolute rounded-tr-[5px] rounded-br-[50px]" />
      <User />
      <div className="w-[389px] p-2.5 left-0 top-[56px] absolute justify-center items-center gap-2 inline-flex">
        {resources.map((item, index) => (
          <Resource key={index} img={item.img} color={item.color} />
        ))}
      </div>
    </div>
  );
};
