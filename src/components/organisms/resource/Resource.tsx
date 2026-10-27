import React, { FunctionComponent } from "react";

import { Col } from "@/components/atoms/Col";
import { Row } from "@/components/atoms/Row";
import { Text } from "@/components/atoms/Text";
import { ProgressBar } from "@/components/molecules/ProgressBar";
import { TextImage } from "@/components/molecules/TextImage";
import { TResource } from "@/context";

interface resourcePropsType {
  resourceData: TResource;
  count: number;
  perHour: number;
  isActive?: boolean;
  resourceCapacity: number;
  onChangeResource?: (resourceData: TResource) => void;
}

export const formatPerHour = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString("en-US")} per hour`;

export const Resource: FunctionComponent<resourcePropsType> = ({
  resourceData,
  count,
  perHour,
  isActive,
  resourceCapacity,
  onChangeResource: onChangeResourceHandler,
}) => {
  const shown = Math.floor(Math.min(count, resourceCapacity));

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col w-full shadow-xl bg-panel rounded p-[3px]"
      style={
        isActive
          ? {
              border: "1px solid #E3A948",
              background: "#2A1F16",
              color: "#1E1610",
            }
          : {
              border: "1px solid transparent",
            }
      }
      onClick={() => {
        onChangeResourceHandler && onChangeResourceHandler(resourceData);
      }}
    >
      <Row className="justify-center">
        <TextImage imgAlt={resourceData.name} imgSrc={resourceData.img} title={resourceData.name} />
      </Row>
      <Col className="gap-1 text-red-50 text-center">
        <Text color={isActive ? "dark" : "white"} size="tiny">
          {shown.toLocaleString("en-US")}
        </Text>

        <ProgressBar size="small" totalValue={resourceCapacity} value={count} />
        <Text className={perHour < 0 ? "!text-bad" : ""} color={isActive ? "dark" : "white"} size="tiny">
          {formatPerHour(perHour)}
        </Text>
      </Col>
    </div>
  );
};
