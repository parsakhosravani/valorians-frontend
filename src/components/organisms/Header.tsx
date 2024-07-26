import { Coin, Population, User } from "../molecules";
import { TResource } from "../templates";
import { Resource } from "./Resource";

interface HeaderProps {
  resources: TResource[];
  activeResourceId: number;
  coin: number;
  resourceCapacity: number;
  onChangeResource: (resource: TResource) => void;
}

export const Header: React.FC<HeaderProps> = ({
  resources,
  onChangeResource,
  activeResourceId,
  resourceCapacity,
  coin,
}) => {
  return (
    <header className="flex gap-2 flex-col p-2">
      <div className="flex items-center gap-2 h-[30px]">
        <User />
        <Population />
        <Coin coin={coin} />
      </div>
      <div className="items-center justify-between w-full gap-2 flex pb-2">
        {resources.map((item) => (
          <Resource
            key={item.id}
            resourceData={item}
            resourceCapacity={resourceCapacity}
            isActive={activeResourceId === item.id}
            onChangeResource={onChangeResource}
          />
        ))}
      </div>
    </header>
  );
};
