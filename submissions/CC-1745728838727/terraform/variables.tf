# Placeholder Terraform variables file (variables.tf).
# Defines input variables for the root Terraform configuration.

# variable "aws_region" {
#   description = "The AWS region to deploy resources in."
#   type        = string
#   default     = "us-east-1" # Example default
# }

# variable "cluster_name" {
#   description = "The name for the EKS cluster."
#   type        = string
#   default     = "demo-eks-cluster"
# }

# variable "node_instance_type" {
#   description = "EC2 instance type for the EKS worker nodes."
#   type        = string
#   default     = "t3.medium"
# }

# variable "desired_node_count" {
#   description = "Desired number of worker nodes in the EKS cluster."
#   type        = number
#   default     = 2
# }

# variable "db_username" {
#   description = "Username for the RDS PostgreSQL database."
#   type        = string
#   sensitive   = true # Mark as sensitive
#   # No default - should be provided securely (e.g., via TF_VAR_db_username env var or .tfvars)
# }

# variable "db_password" {
#   description = "Password for the RDS PostgreSQL database."
#   type        = string
#   sensitive   = true # Mark as sensitive
#   # No default - should be provided securely
# }

# variable "s3_bucket_name_prefix" {
#   description = "Prefix for the S3 bucket name (a random suffix will be added)."
#   type        = string
#   default     = "demo-app-assets"
# } 