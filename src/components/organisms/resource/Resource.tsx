import React, { FunctionComponent } from "react";
import { ProgressBar, TextImage } from "../../molecules";
import { TResource } from "@/context/resource/ResourceContext";
import { Col, Row, Text } from "@/components/atoms";

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
          {resourceData.count < resourceCapacity
            ? resourceData.count.toLocaleString("en-US")
            : resourceCapacity.toLocaleString("en-US")}
        </Text>

        <ProgressBar
          size="small"
          value={resourceData.count}
          totalValue={resourceCapacity}
        />
        <Text color={isActive ? "dark" : "white"} size="tiny">
          +100 per hour
        </Text>
      </Col>
    </div>
  );
};
