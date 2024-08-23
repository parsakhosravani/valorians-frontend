import React, { FunctionComponent } from "react";
import { Col, Row, Text, ProgressBar, TextImage } from "@/components";
import { TResource } from "@/context";

interface resourcePropsType {
  resourceData: TResource;
  isActive?: boolean;
  resourceCapacity: number;
  onChangeResource?: (resourceData: TResource) => void;
}

export const Resource: FunctionComponent<resourcePropsType> = ({
  resourceData,
  isActive,
  resourceCapacity,
  onChangeResource: onChangeResourceHandler,
}) => {
  return (
    <div
      className="flex flex-col w-full shadow-xl bg-[#212F42] rounded p-[3px]"
      style={
        isActive
          ? {
              border: "1px solid #00A3FF",
              background: "#B1D7ED",
              color: "#212F42",
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
        <TextImage
          imgAlt={resourceData.name}
          imgSrc={resourceData.img}
          title={resourceData.name}
        />
      </Row>
      <Col className="gap-1 text-red-50 text-center">
        <Text color={isActive ? "dark" : "white"} size="tiny">
          {resourceData.quantity < resourceCapacity
            ? resourceData.quantity.toLocaleString("en-US")
            : resourceCapacity.toLocaleString("en-US")}
        </Text>

        <ProgressBar
          size="small"
          value={resourceData.quantity}
          totalValue={resourceCapacity}
        />
        <Text color={isActive ? "dark" : "white"} size="tiny">
          +{resourceData.quantityPerHour} per hour
        </Text>
      </Col>
    </div>
  );
};
