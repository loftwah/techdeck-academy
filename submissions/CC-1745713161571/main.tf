# main.tf - Define AWS resources

# TODO: Define VPC
# Recommendation: Use the terraform-aws-modules/vpc/aws module

# TODO: Define EKS Cluster
# Recommendation: Use the terraform-aws-modules/eks/aws module
# Ensure you configure:
# - Cluster name, version
# - VPC and subnet IDs
# - IAM role for the cluster
# - Node group(s) with:
#   - Instance types
#   - Desired/min/max size for autoscaling
#   - IAM role for nodes
#   - Security group(s)
#   - Association with the cluster

# Example Data source to get cluster info for Kubernetes provider
# data "aws_eks_cluster" "cluster" {
#   name = module.eks.cluster_id # Adjust based on module output
# }

# data "aws_eks_cluster_auth" "cluster" {
#   name = module.eks.cluster_id # Adjust based on module output
# }

# TODO: Define RDS PostgreSQL Instance
# Recommendation: Use the aws_db_instance resource or terraform-aws-modules/rds/aws module
# Ensure you configure:
# - Engine, version, instance class
# - Allocated storage
# - Database name, username, password (use variables)
# - VPC security group IDs (allow access from EKS nodes)
# - Subnet group name
# - Parameter group name (optional)
# - Set publicly_accessible = false

# TODO: Define S3 Bucket
# Use the aws_s3_bucket resource
# Ensure you configure:
# - Bucket name (use variable)
# - ACL (e.g., private)
# - Versioning (optional but recommended)
# - Server-side encryption (recommended)

# TODO: Define IAM Roles and Policies
# - EKS Cluster Role
# - EKS Node Group Role
# - Potentially IAM Roles for Service Accounts (IRSA) if pods need direct AWS access
# Apply principle of least privilege

# TODO: Define Security Groups
# - EKS Cluster Security Group
# - EKS Node Security Group (allow node-to-node, node-to-cluster, node-to-internet, node-to-RDS)
# - RDS Security Group (allow access from EKS Node Security Group on PostgreSQL port 5432)

# Placeholder - Remove once actual resources are defined
output "placeholder_main" {
  value = "TODO: Define AWS resources in main.tf"
} 