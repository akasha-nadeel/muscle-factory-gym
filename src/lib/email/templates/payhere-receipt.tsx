import {
  Html,
  Body,
  Container,
  Heading,
  Text,
  Hr,
} from "@react-email/components";

export function PayhereReceiptEmail(props: {
  memberName: string;
  planName: string;
  amountLkr: string;
  newMembershipStart: string;
  newMembershipEnd: string;
}) {
  return (
    <Html>
      <Body
        style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
            Payment received
          </Heading>
          <Text>Hi {props.memberName},</Text>
          <Text>
            We&apos;ve received your payment of{" "}
            <strong>LKR {props.amountLkr}</strong> for the{" "}
            <strong>{props.planName}</strong> plan.
          </Text>
          <Hr style={{ margin: "20px 0" }} />
          <Text>
            <strong>Membership period:</strong>
            <br />
            {props.newMembershipStart} to {props.newMembershipEnd}
          </Text>
          <Text style={{ marginTop: "24px", color: "#666", fontSize: "13px" }}>
            Keep this email as your receipt.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
